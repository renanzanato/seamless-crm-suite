// ──────────────────────────────────────────────────────────
// Pipa Driven — WA-JS Injection (runs in PAGE context)
// ──────────────────────────────────────────────────────────
// Objetivo: expor uma bridge window.postMessage para o content
// script extrair dados do WhatsApp via WPP (wa-js).
//
// Por que page context? O wa-js precisa de acesso a window.Store
// (o Redux interno do WhatsApp), que NÃO é visível do content script.
// ──────────────────────────────────────────────────────────

(function () {
  "use strict";

  if (window.__pipaWaInjected) return;
  window.__pipaWaInjected = true;

  const CHANNEL_REQ = "pipa-wa-req";
  const CHANNEL_RES = "pipa-wa-res";

  let waReady = false;
  const pendingReady = [];
  const emittedReactMessages = new Set();
  const ALLOWED_MESSAGE_TYPES = new Set([
    "chat",
    "text",
    "ptt",
    "audio",
    "image",
    "video",
    "document",
    "sticker",
  ]);
  const MEDIA_MESSAGE_TYPES = new Set(["audio", "image", "video", "document", "sticker", "media"]);
  const MAX_INLINE_MEDIA_BYTES = 25 * 1024 * 1024;
  const ignoredMessageTypes = new Set([
    "call_log",
    "ciphertext",
    "e2e_notification",
    "gp2",
    "notification",
    "notification_template",
    "protocol",
    "revoked",
    "vcard",
    "multi_vcard",
    "location",
    "live_location",
    "payment",
    "order",
    "product",
    "list",
    "list_response",
    "buttons",
    "buttons_response",
    "template",
    "template_button_reply",
    "interactive",
    "poll_creation",
    "poll_vote",
    "reaction",
    "groups_v4_invite",
  ]);
  const SYSTEM_TEXT_PATTERNS = [
    /localiza[cç][aã]o em tempo real/i,
    /live location/i,
    /localiza[cç][aã]o ao vivo/i,
    /mensagem apagada/i,
    /this message was deleted/i,
    /message was deleted/i,
    /waiting for this message/i,
    /aguardando esta mensagem/i,
    /missed (voice|video) call/i,
    /chamada (de voz|de v[ií]deo) perdida/i,
    /you (added|removed|changed)/i,
    /voc[eê] (adicionou|removeu|alterou)/i,
    /messages and calls are end-to-end/i,
    /mensagens e liga[cç][oõ]es s[aã]o protegidas/i,
  ];

  function isSystemText(value) {
    const text = String(value || "").trim();
    if (!text) return false;
    return SYSTEM_TEXT_PATTERNS.some((re) => re.test(text));
  }
  let reactMessageObserver = null;
  let reactMessageObserverTarget = null;
  let reactRetargetTimer = null;

  // wa-js é carregado pelo content script (injectWaJsBundle) e já está
  // disponível como window.WPP quando este script executa. Se por algum
  // motivo ainda não estiver, aguardamos em polling curto.
  function loadWaJs() {
    return new Promise((resolve, reject) => {
      const maxWaitMs = 20000;
      const start = Date.now();
      let warnedSlowLoad = false;
      (function check() {
        if (window.WPP && window.WPP.webpack && typeof window.WPP.webpack.onReady === "function") {
          window.WPP.webpack.onReady(() => {
            waReady = true;
            resolve();
            while (pendingReady.length) pendingReady.shift()();
          });
          return;
        }
        if (!warnedSlowLoad && Date.now() - start > maxWaitMs) {
          warnedSlowLoad = true;
          window.postMessage(
            {
              channel: CHANNEL_RES,
              event: "WA_ERROR",
              error: "WPP ainda não disponível; mantendo nova tentativa em background.",
            },
            "*",
          );
        }
        setTimeout(check, warnedSlowLoad ? 1000 : 150);
      })();
    });
  }

  function whenReady() {
    if (waReady) return Promise.resolve();
    return new Promise((resolve) => pendingReady.push(resolve));
  }

  // ── React Fiber fallback/event stream ───────────────────

  function normalizeText(value) {
    return String(value || "")
      .replace(/\u200e/g, "")
      .replace(/\u200f/g, "")
      .replace(/\u00a0/g, " ")
      .replace(/\r/g, "")
      .trim();
  }

  function hashText(value) {
    let hash = 2166136261;
    const text = String(value || "");
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function parsePrePlainText(value) {
    const text = normalizeText(value);
    const match = text.match(/^\[([^\]]+)\]\s*(.*?):\s*$/);
    return {
      rawTimestamp: match?.[1] || null,
      author: match?.[2] || null,
      prefix: match?.[0] || "",
    };
  }

  function isMetaText(text) {
    const value = normalizeText(text);
    if (!value) return true;
    if (/^\d{1,2}:\d{2}(\s?(am|pm))?$/i.test(value)) return true;
    if (/^\d{1,2}[\/\-]\d{1,2}([\/\-]\d{2,4})?$/.test(value)) return true;
    if (/^--:--$/.test(value)) return true;
    if (/^(encaminhada|forwarded)$/i.test(value)) return true;
    if (/^[✓\s]+$/.test(value)) return true;
    if (/^(hoje|ontem|today|yesterday)$/i.test(value)) return true;
    if (/^(segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo)(-feira)?$/i.test(value)) return true;
    if (/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i.test(value)) return true;
    if (isSystemText(value)) return true;
    return false;
  }

  function inferDomDirection(container, messageId) {
    const text = String(messageId || container.getAttribute("data-id") || "");
    if (text.startsWith("true_")) return "out";
    if (text.startsWith("false_")) return "in";
    return "unknown";
  }

  function extractDomText(container, prePlainText) {
    const values = [];
    const candidates = container.querySelectorAll("[data-pre-plain-text] span[dir], [data-pre-plain-text] div[dir], span[dir], div[dir]");

    for (const node of candidates) {
      if (node.closest("button, [role='button'], svg, audio, video, canvas")) continue;
      const text = normalizeText(node.innerText || node.textContent || "");
      if (isMetaText(text)) continue;
      if (prePlainText?.prefix && text.startsWith(prePlainText.prefix)) continue;
      if (!values.includes(text)) values.push(text);
    }

    const joined = values.join("\n").trim();
    if (joined) return joined;

    const clone = container.cloneNode(true);
    clone.querySelectorAll("button, [role='button'], svg, audio, video, canvas, img").forEach((node) => node.remove());
    let fallback = normalizeText(clone.innerText || clone.textContent || "");
    if (prePlainText?.prefix && fallback.startsWith(prePlainText.prefix)) {
      fallback = normalizeText(fallback.slice(prePlainText.prefix.length));
    }
    return isMetaText(fallback) ? "" : fallback;
  }

  function detectDomMessageType(container, text) {
    if (text) return "text";
    const labels = Array.from(container.querySelectorAll("[aria-label], [data-icon], [title]"))
      .map((node) => `${node.getAttribute("aria-label") || ""} ${node.getAttribute("data-icon") || ""} ${node.getAttribute("title") || ""}`.toLowerCase())
      .join(" ");
    if (/ptt|audio|voice|voz|áudio|audio/.test(labels) || container.querySelector("audio")) return "audio";
    if (/image|video|document|sticker|imagem|vídeo|documento|figurin/.test(labels) || container.querySelector("img, video, canvas")) return "media";
    return "text";
  }

  function isTraversableObject(value) {
    if (!value || typeof value !== "object") return false;
    if (value === window || value === document) return false;
    if (value instanceof Node) return false;
    return true;
  }

  function readPath(value, path) {
    let current = value;
    for (const key of path) {
      if (!current || typeof current !== "object") return undefined;
      current = current[key];
    }
    return current;
  }

  function firstPath(object, paths) {
    for (const path of paths) {
      const value = readPath(object, path);
      if (value !== undefined && value !== null && value !== "") return value;
    }
    return undefined;
  }

  function stringifyId(value) {
    if (value === undefined || value === null || value === "") return "";
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
    if (typeof value === "object") return String(value._serialized || value.serialized || value.user || value.id || "");
    return "";
  }

  function getMessageId(object) {
    const direct = firstPath(object, [
      ["id", "_serialized"],
      ["id", "serialized"],
      ["id", "id"],
      ["key", "id"],
      ["msgId"],
      ["messageId"],
      ["_serialized"],
      ["__x_id", "_serialized"],
      ["__x_id", "id"],
    ]);
    if (direct) return stringifyId(direct);

    const remote = firstPath(object, [
      ["id", "remote", "_serialized"],
      ["id", "remote"],
      ["key", "remoteJid"],
      ["from", "_serialized"],
      ["to", "_serialized"],
    ]);
    const localId = firstPath(object, [["id", "id"], ["key", "id"], ["clientId"]]);
    const fromMe = firstPath(object, [["id", "fromMe"], ["fromMe"], ["from_me"]]);
    if (remote && localId) return `${Boolean(fromMe)}_${stringifyId(remote)}_${stringifyId(localId)}`;

    return "";
  }

  function looksLikeMessageObject(object) {
    if (!isTraversableObject(object)) return false;
    if (!getMessageId(object)) return false;
    return Boolean(
      "body" in object ||
      "caption" in object ||
      "type" in object ||
      "fromMe" in object ||
      "from_me" in object ||
      "t" in object ||
      "timestamp" in object ||
      object.id ||
      object.key
    );
  }

  function findMessageObject(root) {
    const visited = new WeakSet();
    let checked = 0;
    // React Fiber guarda os dados reais em props/memoizedProps e liga cada
    // componente ao pai por `return`; esta travessia sobe e desce essa arvore
    // ate encontrar o objeto nativo da mensagem, sem depender do HTML visual.
    const preferredKeys = [
      "message",
      "msg",
      "model",
      "data",
      "item",
      "row",
      "props",
      "memoizedProps",
      "pendingProps",
      "children",
      "__x_msg",
      "return",
    ];

    function visit(value, depth) {
      if (!isTraversableObject(value) || depth > 8 || checked > 900) return null;
      if (visited.has(value)) return null;
      visited.add(value);
      checked += 1;

      if (looksLikeMessageObject(value)) return value;

      if (Array.isArray(value)) {
        for (const item of value.slice(0, 40)) {
          const found = visit(item, depth + 1);
          if (found) return found;
        }
        return null;
      }

      for (const key of preferredKeys) {
        let child;
        try { child = value[key]; } catch { continue; }
        const found = visit(child, depth + 1);
        if (found) return found;
      }

      for (const key of Object.keys(value).slice(0, 80)) {
        if (["stateNode", "_owner", "ref", "return", "alternate", "memoizedState"].includes(key)) continue;
        let child;
        try { child = value[key]; } catch { continue; }
        const found = visit(child, depth + 1);
        if (found) return found;
      }

      return null;
    }

    return visit(root, 0);
  }

  function getReactRoots(element) {
    const roots = [];
    const nodes = [
      element,
      ...Array.from(element.querySelectorAll?.("[data-id], [data-pre-plain-text], span[dir], div[dir]") || []).slice(0, 80),
    ];

    for (const node of nodes) {
      for (const key of Object.keys(node)) {
        if (key.startsWith("__reactFiber$") || key.startsWith("__reactProps$")) roots.push(node[key]);
      }
    }
    return roots;
  }

  function getMessageText(object) {
    return normalizeText(firstPath(object, [
      ["body"],
      ["caption"],
      ["text"],
      ["content"],
      ["message", "conversation"],
      ["message", "extendedTextMessage", "text"],
      ["__x_body"],
      ["__x_caption"],
    ]) || "");
  }

  function getMessageType(object, text) {
    const type = String(firstPath(object, [["type"], ["mediaData", "type"], ["__x_type"]]) || "").toLowerCase();
    if (["ptt", "audio"].includes(type)) return "audio";
    if (["image", "video", "document", "sticker"].includes(type)) return type;
    if (text) return "text";
    if (object.mediaKey || object.isMedia) return "media";
    return type || "text";
  }

  function getRawMessageType(object) {
    return String(firstPath(object, [["type"], ["subtype"], ["__x_type"], ["mediaData", "type"]]) || "").toLowerCase();
  }

  function getMessageTimestamp(object) {
    const raw = firstPath(object, [["t"], ["timestamp"], ["messageTimestamp"], ["__x_t"]]);
    if (!raw) return new Date().toISOString();
    const number = Number(raw);
    if (!Number.isFinite(number)) return String(raw);
    return new Date(number < 10000000000 ? number * 1000 : number).toISOString();
  }

  function getMessageDirection(object) {
    const fromMe = firstPath(object, [["fromMe"], ["from_me"], ["id", "fromMe"], ["key", "fromMe"], ["__x_isSentByMe"]]);
    if (fromMe === true) return "out";
    if (fromMe === false) return "in";
    return "unknown";
  }

  function getChatJid(object) {
    return stringifyId(firstPath(object, [
      ["id", "remote", "_serialized"],
      ["id", "remote"],
      ["key", "remoteJid"],
      ["chatId", "_serialized"],
      ["chatId"],
      ["to", "_serialized"],
      ["from", "_serialized"],
    ])) || "";
  }

  function normalizeReactMessage(object) {
    const id = getMessageId(object);
    if (!id) return null;

    const chatJid = getChatJid(object);
    if (chatJid && /@g\.us/i.test(chatJid)) return null;

    const text = getMessageText(object);
    const type = getMessageType(object, text);
    const rawType = getRawMessageType(object);
    if (
      ignoredMessageTypes.has(rawType) ||
      ignoredMessageTypes.has(type) ||
      object.isNotification === true ||
      object.isSystemMsg === true ||
      object.isStatusV3 === true ||
      object.broadcast === true
    ) {
      return null;
    }
    if (rawType && !ALLOWED_MESSAGE_TYPES.has(rawType) && !ALLOWED_MESSAGE_TYPES.has(type)) {
      return null;
    }
    if (isSystemText(text)) return null;
    if (!text && (type === "text" || type === "chat")) return null;

    const timestamp = getMessageTimestamp(object);
    const direction = getMessageDirection(object);

    return {
      id,
      raw_id: id,
      chat_jid: chatJid,
      direction,
      author: stringifyId(firstPath(object, [["author"], ["from"], ["sender", "id"], ["senderObj", "id"]])) || null,
      type,
      text,
      content_md: text,
      rawTimestamp: null,
      timestamp,
      timestamp_wa: timestamp,
      source: "react-fiber-page",
    };
  }

  function extractReactMessageFromNode(node) {
    if (!(node instanceof Element)) return null;
    for (const root of getReactRoots(node)) {
      const object = findMessageObject(root);
      const message = object ? normalizeReactMessage(object) : null;
      if (message) return message;
    }
    return null;
  }

  function extractDomMessageFromNode(node) {
    if (!(node instanceof Element)) return null;
    const container = node.closest?.("[data-id]") || node.closest?.("[data-pre-plain-text]") || node;
    if (!(container instanceof Element)) return null;

    const dataId = container.getAttribute("data-id") || container.querySelector("[data-id]")?.getAttribute("data-id") || "";
    const preNode = container.matches("[data-pre-plain-text]")
      ? container
      : container.querySelector("[data-pre-plain-text]");
    const pre = parsePrePlainText(preNode?.getAttribute("data-pre-plain-text") || "");
    const text = extractDomText(container, pre);
    const type = detectDomMessageType(container, text);
    const id = dataId || `dom:${hashText(`${pre.rawTimestamp}|${pre.author}|${text}`)}`;

    if (!id || (!text && type === "text")) return null;

    const timestamp = new Date().toISOString();
    return {
      id,
      raw_id: id,
      direction: inferDomDirection(container, id),
      author: pre.author,
      type,
      text,
      content_md: text,
      rawTimestamp: pre.rawTimestamp,
      timestamp,
      timestamp_wa: timestamp,
      source: "dom-page",
    };
  }

  function emitMessage(message) {
    if (!message || !message.id || emittedReactMessages.has(message.id)) return;
    emittedReactMessages.add(message.id);
    if (emittedReactMessages.size > 2000) {
      const first = emittedReactMessages.values().next().value;
      emittedReactMessages.delete(first);
    }
    window.postMessage({ channel: CHANNEL_RES, event: "WA_MESSAGE", data: message }, "*");
  }

  function emitReactMessageFromNode(node) {
    const message = extractReactMessageFromNode(node) || extractDomMessageFromNode(node);
    emitMessage(message);
  }

  // ── WPP model → WA_MESSAGE serializer ───────────────────
  // Usado pelo listener global WPP.ev.on('chat.new_message') e pelo backfill
  // via WPP.chat.getMessages. Compartilha as mesmas regras de filtro que a
  // extração via React Fiber para manter o contrato do WA_MESSAGE estável.

  function mimeFromMessage(msg, fallback = "") {
    return normalizeText(firstPath(msg, [
      ["mimetype"],
      ["mimeType"],
      ["mediaData", "mimetype"],
      ["mediaData", "mimeType"],
      ["mediaData", "mediaStage", "mimetype"],
    ]) || fallback);
  }

  function fileNameFromMessage(msg) {
    return normalizeText(firstPath(msg, [
      ["filename"],
      ["fileName"],
      ["mediaData", "filename"],
      ["mediaData", "fileName"],
      ["documentTitle"],
    ]) || "");
  }

  function extensionFromMime(mime, type) {
    const normalized = String(mime || "").toLowerCase().split(";")[0];
    const byMime = {
      "audio/aac": "aac",
      "audio/amr": "amr",
      "audio/mpeg": "mp3",
      "audio/mp4": "m4a",
      "audio/ogg": "ogg",
      "audio/opus": "opus",
      "audio/wav": "wav",
      "audio/webm": "webm",
      "image/gif": "gif",
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "video/mp4": "mp4",
      "video/quicktime": "mov",
      "video/webm": "webm",
      "application/pdf": "pdf",
    };
    if (byMime[normalized]) return byMime[normalized];
    if (normalized.includes("/")) return normalized.split("/").pop().replace(/[^a-z0-9]/g, "") || type || "bin";
    if (type === "sticker") return "webp";
    if (type === "audio") return "ogg";
    return "bin";
  }

  function mediaKindFromMime(mime, fallbackType) {
    const normalized = String(mime || "").toLowerCase();
    if (fallbackType === "sticker") return "sticker";
    if (normalized.startsWith("audio/")) return "audio";
    if (normalized.startsWith("image/")) return fallbackType === "sticker" ? "sticker" : "image";
    if (normalized.startsWith("video/")) return "video";
    if (normalized.startsWith("application/")) return "document";
    return MEDIA_MESSAGE_TYPES.has(fallbackType) ? fallbackType : "media";
  }

  function estimateDataUrlBytes(dataUrl) {
    const comma = String(dataUrl || "").indexOf(",");
    if (comma < 0) return 0;
    const base64 = dataUrl.slice(comma + 1);
    return Math.max(0, Math.floor((base64.length * 3) / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0));
  }

  function dataUrlMime(dataUrl, fallback = "") {
    const match = String(dataUrl || "").match(/^data:([^;,]+)[;,]/i);
    return match?.[1] || fallback;
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Falha lendo media do WhatsApp."));
      reader.readAsDataURL(blob);
    });
  }

  async function normalizeDownloadedMedia(downloaded, msg, type) {
    if (!downloaded) return null;

    const fallbackMime = mimeFromMessage(msg);
    const fallbackName = fileNameFromMessage(msg);

    if (typeof downloaded === "string") {
      const dataUrl = downloaded.startsWith("data:")
        ? downloaded
        : `data:${fallbackMime || "application/octet-stream"};base64,${downloaded}`;
      const size = estimateDataUrlBytes(dataUrl);
      const mime = dataUrlMime(dataUrl, fallbackMime || "application/octet-stream");
      if (size > MAX_INLINE_MEDIA_BYTES) {
        return { error: "media_too_large", mime, size };
      }
      const kind = mediaKindFromMime(mime, type);
      return {
        data_url: dataUrl,
        mime,
        size,
        type: kind,
        file_name: fallbackName || null,
        extension: extensionFromMime(mime, kind),
      };
    }

    if (downloaded instanceof Blob) {
      const mime = downloaded.type || fallbackMime || "application/octet-stream";
      const size = downloaded.size || 0;
      if (size > MAX_INLINE_MEDIA_BYTES) {
        return { error: "media_too_large", mime, size };
      }
      const kind = mediaKindFromMime(mime, type);
      return {
        data_url: await blobToDataUrl(downloaded),
        mime,
        size,
        type: kind,
        file_name: downloaded.name || fallbackName || null,
        extension: extensionFromMime(mime, kind),
      };
    }

    if (typeof downloaded === "object") {
      const blob = downloaded.blob || downloaded.file;
      if (blob instanceof Blob) return normalizeDownloadedMedia(blob, msg, type);

      const rawData = downloaded.data || downloaded.base64 || downloaded.body;
      const mime = downloaded.mimetype || downloaded.mimeType || fallbackMime || "application/octet-stream";
      if (typeof rawData === "string" && rawData) {
        const dataUrl = rawData.startsWith("data:") ? rawData : `data:${mime};base64,${rawData}`;
        const size = Number(downloaded.size || downloaded.fileSize || estimateDataUrlBytes(dataUrl));
        if (size > MAX_INLINE_MEDIA_BYTES) {
          return { error: "media_too_large", mime, size };
        }
        const kind = mediaKindFromMime(mime, type);
        return {
          data_url: dataUrl,
          mime,
          size,
          type: kind,
          file_name: downloaded.filename || downloaded.fileName || fallbackName || null,
          extension: extensionFromMime(mime, kind),
        };
      }
    }

    return null;
  }

  async function downloadMessageMedia(msg, type) {
    if (!MEDIA_MESSAGE_TYPES.has(type) && !msg?.mediaKey && !msg?.isMedia) return null;
    const downloadMedia = window.WPP?.chat?.downloadMedia;
    if (typeof downloadMedia !== "function") return null;

    try {
      return await normalizeDownloadedMedia(await downloadMedia(msg), msg, type);
    } catch (error) {
      return { error: error?.message || "download_failed" };
    }
  }

  async function serializeWppModelMessage(msg, source = "wpp-ev") {
    if (!msg) return null;

    const id = stringifyId(msg.id) || stringifyId(msg._serialized);
    if (!id) return null;

    const chatJid =
      stringifyId(firstPath(msg, [["id", "remote"], ["from"], ["to"], ["chatId"]])) || "";
    if (chatJid && /@g\.us/i.test(chatJid)) return null;

    const rawType = String(msg.type || msg.subtype || "").toLowerCase();
    if (ignoredMessageTypes.has(rawType)) return null;
    if (
      msg.isNotification === true ||
      msg.isSystemMsg === true ||
      msg.isStatusV3 === true ||
      msg.broadcast === true
    ) {
      return null;
    }

    const text = normalizeText(msg.body || msg.caption || "");
    if (isSystemText(text)) return null;

    let type = rawType;
    if (["ptt", "audio"].includes(rawType)) type = "audio";
    else if (["image", "video", "document", "sticker"].includes(rawType)) {
      type = rawType;
    } else if (msg.mediaKey || msg.isMedia) {
      type = "media";
    } else if (rawType === "chat" || rawType === "text" || (!rawType && text)) {
      type = "text";
    }

    if (type === "text" && !text) return null;
    if (rawType && !ALLOWED_MESSAGE_TYPES.has(rawType) && !ALLOWED_MESSAGE_TYPES.has(type)) {
      return null;
    }

    const rawTs = msg.t ?? msg.timestamp;
    const tsNumber = Number(rawTs);
    const ms = Number.isFinite(tsNumber)
      ? (tsNumber < 10000000000 ? tsNumber * 1000 : tsNumber)
      : Date.now();
    const timestamp = new Date(ms).toISOString();

    const fromMe = msg.fromMe;
    const direction = fromMe === true ? "out" : fromMe === false ? "in" : "unknown";
    const author =
      stringifyId(firstPath(msg, [["author"], ["from"], ["sender", "id"], ["senderObj", "id"]])) ||
      null;

    const media = await downloadMessageMedia(msg, type);
    if (media?.type && type === "media") type = media.type;

    return {
      id,
      raw_id: id,
      chat_jid: chatJid,
      direction,
      author,
      type,
      text,
      content_md: text,
      rawTimestamp: null,
      timestamp,
      timestamp_wa: timestamp,
      has_media: Boolean(media?.data_url || media?.error || msg.mediaKey || msg.isMedia),
      media: media?.data_url ? media : null,
      media_mime: media?.mime || mimeFromMessage(msg) || null,
      media_size: media?.size || null,
      media_filename: media?.file_name || fileNameFromMessage(msg) || null,
      media_type: media?.type || type,
      media_download_error: media?.error || null,
      source,
    };
  }

  function startWppGlobalListener() {
    if (window.__pipaWppListenerBound) return;
    if (!window.WPP?.ev?.on) return;
    window.__pipaWppListenerBound = true;

    window.WPP.ev.on("chat.new_message", (msg) => {
      serializeWppModelMessage(msg, "wpp-ev")
        .then(emitMessage)
        .catch((err) => {
          console.warn("[Pipa] chat.new_message handler failed:", err);
        });
    });
  }

  function getActiveMessageContainer() {
    const main = document.querySelector("#main");
    if (!main) return null;

    const region = Array.from(main.querySelectorAll('[role="region"]'))
      .reverse()
      .find((node) => node.querySelector("[data-id], [data-pre-plain-text]"));
    if (region) return region;

    const messageNode = main.querySelector("[data-id], [data-pre-plain-text]");
    if (!messageNode) return main;

    return (
      messageNode.closest('[role="region"]') ||
      messageNode.closest('[aria-label]') ||
      messageNode.parentElement?.parentElement ||
      main
    );
  }

  function handleMessageMutations(mutations) {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches("[data-id], [data-pre-plain-text]")) emitReactMessageFromNode(node);
        node.querySelectorAll?.("[data-id], [data-pre-plain-text]").forEach(emitReactMessageFromNode);
      }
    }
  }

  function attachReactMessageObserver() {
    const target = getActiveMessageContainer();
    if (!target || target === reactMessageObserverTarget) return;

    reactMessageObserver?.disconnect();
    reactMessageObserverTarget = target;
    reactMessageObserver = new MutationObserver(handleMessageMutations);
    reactMessageObserver.observe(target, { childList: true, subtree: true });
  }

  function scheduleReactObserverRetarget(delay = 250) {
    clearTimeout(reactRetargetTimer);
    reactRetargetTimer = setTimeout(attachReactMessageObserver, delay);
  }

  function startReactMessageObserver() {
    if (window.__pipaReactMessageObserver) return;
    window.__pipaReactMessageObserver = true;

    attachReactMessageObserver();

    const layoutObserver = new MutationObserver(() => {
      scheduleReactObserverRetarget();
    });

    layoutObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }

  // ── Feature helpers ─────────────────────────────────────

  async function getCurrentChat() {
    await whenReady();
    const active = window.WPP.chat.getActiveChat();
    if (!active) return null;
    return serializeChat(active);
  }

  function serializeChat(chat) {
    const id = chat.id?._serialized || String(chat.id);
    const contact = chat.contact || {};
    const rawNumber = contact.id?.user || chat.id?.user || "";
    return {
      chat_id: id,
      is_group: !!chat.isGroup,
      number_raw: rawNumber,
      number_e164: normalizeE164(rawNumber),
      display_name: chat.name || contact.name || contact.pushname || rawNumber,
      push_name: contact.pushname || null,
      profile_pic_url: contact.profilePicThumbObj?.eurl || null,
    };
  }

  function normalizeE164(raw) {
    if (!raw) return null;
    const digits = String(raw).replace(/\D+/g, "");
    if (!digits) return null;
    return `+${digits}`;
  }

  async function getChatMessages(chatId, count = 200) {
    await whenReady();
    const msgs = await window.WPP.chat.getMessages(chatId, { count });
    const serialized = await Promise.all((msgs || []).map(serializeMessage));
    return serialized.filter(Boolean);
  }

  async function sendTextMessage(payload = {}) {
    await whenReady();
    const text = normalizeText(payload.text || payload.content || "");
    if (!text) throw new Error("Mensagem vazia.");

    let chatId = String(payload.chat_id || payload.chatId || "").replace(/^wa:/, "");
    if (!chatId) {
      const chat = await getCurrentChat();
      chatId = chat?.chat_id || "";
    }
    if (!chatId) throw new Error("Chat ativo não identificado para envio via WPP.");

    const sendText = window.WPP.chat.sendTextMessage || window.WPP.chat.sendText;
    if (typeof sendText !== "function") {
      throw new Error("WPP.chat.sendTextMessage não está disponível nesta versão do WhatsApp Web.");
    }

    const sent = await sendText(chatId, text, payload.options || {});
    return sent ? await serializeMessage(sent) : {
      wa_msg_id: null,
      raw_id: null,
      chat_id: chatId,
      from_me: true,
      author: null,
      type: "chat",
      body: text,
      content_md: text,
      timestamp: new Date().toISOString(),
      timestamp_wa: new Date().toISOString(),
      has_media: false,
      quoted_msg_id: null,
    };
  }

  async function serializeMessage(m) {
    const id = m.id?._serialized || String(m.id);
    const ts = m.t ? m.t * 1000 : Date.now();
    const body = m.body || m.caption || "";
    const timestamp = new Date(ts).toISOString();
    const rawType = String(m.type || "chat").toLowerCase();
    const type = rawType === "ptt" || rawType === "voice" ? "audio" : rawType;
    const media = await downloadMessageMedia(m, type);
    const mediaType = media?.type || type;

    return {
      wa_msg_id: id,
      raw_id: id,
      chat_id: m.from?._serialized || m.to?._serialized || null,
      from_me: !!m.fromMe,
      author: m.author?._serialized || m.from?._serialized || null,
      type: mediaType,
      body,
      content_md: body,
      timestamp,
      timestamp_wa: timestamp,
      has_media: Boolean(media?.data_url || media?.error || m.mediaKey || m.isMedia),
      media: media?.data_url ? media : null,
      media_mime: media?.mime || mimeFromMessage(m) || null,
      media_size: media?.size || null,
      media_filename: media?.file_name || fileNameFromMessage(m) || null,
      media_type: mediaType,
      media_download_error: media?.error || null,
      quoted_msg_id: m.quotedStanzaID || null,
    };
  }

  // ── Page ↔ Content bridge ───────────────────────────────

  window.addEventListener("message", async (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.channel !== CHANNEL_REQ) return;

    const { requestId, action, payload } = data;
    let response = { ok: false, error: "unknown action" };

    try {
      switch (action) {
        case "PING":
          response = { ok: true, ready: waReady };
          break;
        case "GET_CURRENT_CHAT":
          response = { ok: true, data: await getCurrentChat() };
          break;
        case "GET_CHAT_MESSAGES":
          response = {
            ok: true,
            data: await getChatMessages(payload.chat_id, payload.count || 200),
          };
          break;
        case "GET_CHAT_HISTORY": {
          await whenReady();
          const count = typeof payload?.count === "number" ? payload.count : 500;
          const msgs = await window.WPP.chat.getMessages(payload.chat_id, { count });
          const serialized = (await Promise.all((msgs || [])
            .map((m) => serializeWppModelMessage(m, "wpp-backfill"))))
            .filter(Boolean);
          response = { ok: true, data: serialized };
          break;
        }
        case "SEND_TEXT_MESSAGE":
          response = { ok: true, data: await sendTextMessage(payload || {}) };
          break;
        case "GET_CURRENT_CHAT_HISTORY": {
          const chat = await getCurrentChat();
          if (!chat) {
            response = { ok: false, error: "Nenhum chat aberto" };
            break;
          }
          const messages = await getChatMessages(chat.chat_id, payload?.count || 200);
          response = { ok: true, data: { chat, messages } };
          break;
        }
        default:
          response = { ok: false, error: `Action ${action} não suportada` };
      }
    } catch (err) {
      response = { ok: false, error: err?.message || String(err) };
    }

    window.postMessage({ channel: CHANNEL_RES, requestId, ...response }, "*");
  });

  // ── Boot ────────────────────────────────────────────────

  startReactMessageObserver();

  loadWaJs()
    .then(() => {
      startWppGlobalListener();
      window.postMessage({ channel: CHANNEL_RES, event: "WA_READY" }, "*");
      console.log("[Pipa] wa-js ready");
    })
    .catch((err) => {
      window.postMessage(
        { channel: CHANNEL_RES, event: "WA_ERROR", error: err.message },
        "*",
      );
      console.error("[Pipa] wa-js load failed:", err);
    });
})();
