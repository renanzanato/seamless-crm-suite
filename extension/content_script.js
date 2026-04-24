(() => {
  const STATE = {
    authenticated: false,
    bridgeReady: false,
    bridgeFailed: false,
    bridgeBootPromise: null,
    currentChatKey: null,
    currentChatId: null,
    currentPhone: null,
    currentTitle: null,
    currentSource: "none",
    approvedContact: null,
    monitoring: false,
    lookupInProgress: false,
    lookupToken: 0,
    processedMessages: new Set(),
    evaluateTimer: null,
    scanTimer: null,
    pendingStructuredMessages: [],
    processingNodes: false,
    backfilledChats: new Set(),
  };

  const MAX_PROCESSED_MESSAGES = 2500;
  const MAX_PENDING_MESSAGES = 500;
  const VALID_BRAZIL_DDDS = new Set([
    "11", "12", "13", "14", "15", "16", "17", "18", "19",
    "21", "22", "24", "27", "28",
    "31", "32", "33", "34", "35", "37", "38",
    "41", "42", "43", "44", "45", "46", "47", "48", "49",
    "51", "53", "54", "55",
    "61", "62", "63", "64", "65", "66", "67", "68", "69",
    "71", "73", "74", "75", "77", "79",
    "81", "82", "83", "84", "85", "86", "87", "88", "89",
    "91", "92", "93", "94", "95", "96", "97", "98", "99",
  ]);

  function sendRuntimeMessage(message) {
    return chrome.runtime
      .sendMessage(message)
      .catch((error) => ({ ok: false, error: error?.message || String(error) }));
  }

  function notifyUi(patch = {}) {
    window.dispatchEvent(new CustomEvent("pipa:crm-state", {
      detail: {
        authenticated: STATE.authenticated,
        chatKey: STATE.currentChatKey,
        chatId: STATE.currentChatId,
        phone: STATE.currentPhone,
        title: STATE.currentTitle,
        source: STATE.currentSource,
        monitoring: STATE.monitoring,
        contact: STATE.approvedContact,
        ...patch,
      },
    }));
  }

  const ALLOWED_MESSAGE_TYPES = new Set([
    "text",
    "chat",
    "audio",
    "media",
    "image",
    "video",
    "document",
    "sticker",
    "ptt",
  ]);
  const IGNORED_MESSAGE_TYPES = new Set([
    "call_log",
    "ciphertext",
    "e2e_notification",
    "gp2",
    "multi_vcard",
    "notification",
    "notification_template",
    "protocol",
    "revoked",
    "vcard",
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

  function normalizePhone(value) {
    let text = String(value || "").trim();
    text = text.replace(/@(?:c\.us|s\.whatsapp\.net|g\.us).*$/i, "");
    let digits = text.replace(/[^\d]/g, "");
    if (digits.startsWith("00") && digits.length > 10) digits = digits.slice(2);
    return digits;
  }

  function buildPhoneVariants(value) {
    const phone = normalizePhone(value);
    if (!phone) return [];

    const variants = new Set([phone]);
    const addBrazilNinthDigitVariants = (digits) => {
      if (!digits.startsWith("55")) return;
      const ddd = digits.slice(2, 4);
      if (!VALID_BRAZIL_DDDS.has(ddd)) return;
      const subscriber = digits.slice(4);
      if (digits.length === 13 && subscriber.startsWith("9")) {
        variants.add(`${digits.slice(0, 4)}${subscriber.slice(1)}`);
      }
      if (digits.length === 12) {
        variants.add(`${digits.slice(0, 4)}9${subscriber}`);
      }
    };

    addBrazilNinthDigitVariants(phone);
    const localDdd = phone.slice(0, 2);
    if (!phone.startsWith("55") && (phone.length === 10 || phone.length === 11) && VALID_BRAZIL_DDDS.has(localDdd)) {
      variants.add(`55${phone}`);
      addBrazilNinthDigitVariants(`55${phone}`);
    }

    return Array.from(variants);
  }

  function digitsOnly(value) {
    return String(value || "").replace(/[^\d]/g, "");
  }

  function isProbablyPhone(value) {
    const digits = digitsOnly(value);
    return digits.length >= 10 && digits.length <= 15;
  }

  function findPhoneInText(text) {
    const candidates = String(text || "").match(/(?:\+|00)?\d[\d\s().-]{8,}\d/g) || [];
    for (const candidate of candidates) {
      const normalized = normalizePhone(candidate);
      if (isProbablyPhone(normalized)) return normalized;
    }
    return "";
  }

  function normalizeText(value) {
    return String(value || "")
      .replace(/\u200e/g, "")
      .replace(/\u200f/g, "")
      .replace(/\u00a0/g, " ")
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
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

  function makeChatKey(phone, title, structuredId) {
    if (structuredId) return `wa:${structuredId}`;
    if (phone) return `phone:${digitsOnly(phone)}`;
    if (title) return `title:${normalizeText(title).toLowerCase()}`;
    return "";
  }

  function getMainPane() {
    return document.querySelector("#main") || document.querySelector('[role="application"]');
  }

  function getHeader() {
    const main = getMainPane();
    return main?.querySelector("header") || null;
  }

  function getDomChatTitle() {
    const header = getHeader();
    if (!header) return "";

    const attrNode = Array.from(header.querySelectorAll("[title], [aria-label]"))
      .find((node) => {
        const value = normalizeText(node.getAttribute("title") || node.getAttribute("aria-label"));
        return value && !/search|pesquisar|menu|more|mais|video|call|ligar/i.test(value);
      });

    const titleFromAttr = attrNode?.getAttribute("title") || attrNode?.getAttribute("aria-label") || "";
    if (normalizeText(titleFromAttr)) return normalizeText(titleFromAttr);

    const textNode = Array.from(header.querySelectorAll("span[dir], div[dir]"))
      .map((node) => normalizeText(node.textContent))
      .find(Boolean);
    return textNode || normalizeText(header.textContent);
  }

  function extractPhoneFromDataId(dataId) {
    const value = String(dataId || "");
    if (/@g\.us/i.test(value)) return "";

    const jid = value.match(/(?:^|[_-])(\d{10,15})@(?:c\.us|s\.whatsapp\.net)/i);
    if (jid?.[1]) return normalizePhone(jid[1]);

    const fallback = value.match(/(\d{10,15})/);
    return fallback?.[1] ? normalizePhone(fallback[1]) : "";
  }

  function extractPhoneFromHeader() {
    const header = getHeader();
    if (!header) return "";

    const values = [];
    for (const node of header.querySelectorAll("[title], [aria-label], span[dir], div[dir]")) {
      values.push(node.getAttribute("title"), node.getAttribute("aria-label"), node.textContent);
    }
    values.push(header.textContent);

    for (const value of values) {
      const phone = findPhoneInText(value);
      if (phone) return phone;
    }
    return "";
  }

  function extractPhoneFromVisibleMessageIds() {
    const main = getMainPane();
    if (!main) return "";

    for (const node of main.querySelectorAll("[data-id]")) {
      const phone = extractPhoneFromDataId(node.getAttribute("data-id"));
      if (phone) return phone;
    }
    return "";
  }

  function detectDomGroup() {
    const main = getMainPane();
    if (!main) return false;
    if (main.querySelector('[data-id*="@g.us"]')) return true;
    const header = getHeader();
    if (header) {
      const labels = Array.from(header.querySelectorAll('[aria-label], [title]'))
        .map((node) => `${node.getAttribute("aria-label") || ""} ${node.getAttribute("title") || ""}`.toLowerCase())
        .join(" ");
      if (/participant|participante|group info|dados do grupo/.test(labels)) return true;
    }
    return false;
  }

  function getDomActiveChat() {
    const title = getDomChatTitle();
    const isGroup = detectDomGroup();
    const phone = isGroup ? "" : (extractPhoneFromHeader() || extractPhoneFromVisibleMessageIds());
    const chatKey = isGroup
      ? makeChatKey("", title, `group:${title}`)
      : makeChatKey(phone, title, "");
    if (!chatKey) return null;
    return {
      chatKey,
      chatId: "",
      phone,
      title,
      isGroup,
      source: "dom",
    };
  }

  function bootStructuredBridge() {
    if (STATE.bridgeBootPromise) return STATE.bridgeBootPromise;

    STATE.bridgeBootPromise = (async () => {
      const bridge = window.PipaWaBridge;
      if (!bridge?.injectScript || !bridge?.whenReady) {
        STATE.bridgeFailed = true;
        return false;
      }

      try {
        bridge.injectScript();
        await bridge.whenReady(18000);
        STATE.bridgeReady = true;
        STATE.bridgeFailed = false;
        return true;
      } catch (error) {
        console.warn("[Pipa] structured WA bridge unavailable:", error);
        STATE.bridgeReady = false;
        STATE.bridgeFailed = true;
        return false;
      }
    })().finally(() => {
      if (!STATE.bridgeReady) STATE.bridgeBootPromise = null;
    });

    return STATE.bridgeBootPromise;
  }

  function getBridge() {
    return STATE.bridgeReady && window.PipaWaBridge ? window.PipaWaBridge : null;
  }

  async function getStructuredActiveChat() {
    if (!STATE.bridgeReady) {
      void bootStructuredBridge().finally(() => {
        if (STATE.bridgeReady) scheduleEvaluate(50);
      });
      return null;
    }

    const bridge = getBridge();
    if (!bridge?.getCurrentChat) return null;

    try {
      const chat = await bridge.getCurrentChat();
      if (!chat) return null;
      if (chat.is_group) {
        return {
          chatKey: `wa:${chat.chat_id}`,
          chatId: chat.chat_id,
          phone: "",
          title: chat.display_name || chat.chat_id,
          isGroup: true,
          source: "wpp",
          raw: chat,
        };
      }

      const phone = normalizePhone(chat.number_e164 || chat.number_raw || "");
      const title = normalizeText(chat.display_name || chat.push_name || phone || chat.chat_id);
      const chatKey = makeChatKey(phone, title, chat.chat_id);
      return {
        chatKey,
        chatId: chat.chat_id,
        phone,
        title,
        isGroup: false,
        source: "wpp",
        raw: chat,
      };
    } catch (error) {
      console.warn("[Pipa] failed reading structured active chat:", error);
      return null;
    }
  }

  async function getActiveChat() {
    const structured = await getStructuredActiveChat();
    if (structured) return structured;
    return getDomActiveChat();
  }

  function parseStructuredType(message) {
    const type = String(message?.type || "").toLowerCase();
    if (IGNORED_MESSAGE_TYPES.has(type)) return type;
    if (["ptt", "audio"].includes(type)) return "audio";
    if (message?.has_media || ["image", "video", "document", "sticker"].includes(type)) return "media";
    return "text";
  }

  function normalizeMessageDirection(value, fallback = "unknown") {
    if (value === true) return "out";
    if (value === false) return "in";
    const direction = String(value || fallback).toLowerCase();
    if (["out", "sent", "from_me", "true"].includes(direction)) return "out";
    if (["in", "received", "false"].includes(direction)) return "in";
    return "unknown";
  }

  function normalizeCapturedMessage(message) {
    const id = String(message?.raw_id || message?.id || message?.wa_msg_id || "");
    if (!id) return null;

    const rawType = String(message?.type || "").toLowerCase();
    if (IGNORED_MESSAGE_TYPES.has(rawType)) return null;

    const type = parseStructuredType(message);
    if (IGNORED_MESSAGE_TYPES.has(type)) return null;
    if (!ALLOWED_MESSAGE_TYPES.has(type)) return null;

    const text = normalizeText(message?.content_md || message?.text || message?.body || message?.caption || "");
    if (isSystemText(text)) return null;
    if (!text && (type === "text" || type === "chat")) return null;

    const timestamp = message?.timestamp_wa || message?.timestamp || new Date().toISOString();
    const direction = normalizeMessageDirection(message?.direction, message?.from_me);

    return {
      id,
      raw_id: id,
      chat_jid: String(message?.chat_jid || "").trim(),
      direction,
      author: message?.author || null,
      type,
      text,
      content_md: text,
      rawTimestamp: message?.rawTimestamp || message?.raw_timestamp || null,
      timestamp,
      timestamp_wa: timestamp,
      source: message?.source || "unknown",
    };
  }

  function rememberProcessedMessage(id) {
    if (!id) return;
    STATE.processedMessages.add(id);
    if (STATE.processedMessages.size > MAX_PROCESSED_MESSAGES) {
      const overflow = STATE.processedMessages.size - MAX_PROCESSED_MESSAGES;
      const iterator = STATE.processedMessages.values();
      for (let index = 0; index < overflow; index += 1) {
        const next = iterator.next();
        if (next.done) break;
        STATE.processedMessages.delete(next.value);
      }
    }
  }

  function clearPendingMessages() {
    STATE.pendingStructuredMessages = [];
  }

  async function refreshAuthState() {
    const response = await sendRuntimeMessage({ type: "CRM_GET_SESSION" });
    STATE.authenticated = Boolean(response.ok && response.data);
    if (!STATE.authenticated) {
      stopMonitoring();
      notifyUi({ status: "unauthenticated" });
    }
  }

  function stopMonitoring() {
    STATE.monitoring = false;
    STATE.lookupInProgress = false;
    STATE.approvedContact = null;
    clearPendingMessages();
  }

  function startMonitoring() {
    STATE.monitoring = true;
    scheduleMessageScan(80);
  }

  async function evaluateActiveChat() {
    window.clearTimeout(STATE.evaluateTimer);
    await refreshAuthState();
    if (!STATE.authenticated) return;

    const chat = await getActiveChat();
    if (!chat?.chatKey) {
      notifyUi({ status: "no_chat" });
      return;
    }
    if (chat.chatKey === STATE.currentChatKey) return;

    STATE.currentChatKey = chat.chatKey;
    STATE.currentChatId = chat.chatId || "";
    STATE.currentPhone = chat.phone || "";
    STATE.currentTitle = chat.title || "";
    STATE.currentSource = chat.source || "dom";
    STATE.approvedContact = null;
    STATE.monitoring = false;
    STATE.lookupInProgress = false;

    if (chat.isGroup) {
      notifyUi({ status: "group_ignored" });
      return;
    }
    if (!chat.phone) {
      notifyUi({ status: "missing_phone" });
      return;
    }

    const lookupToken = STATE.lookupToken + 1;
    STATE.lookupToken = lookupToken;
    STATE.lookupInProgress = true;
    notifyUi({ status: "checking_contact" });

    const lookupPromise = sendRuntimeMessage({
      type: "CRM_LOOKUP_CONTACT",
      payload: { phone: chat.phone, phoneVariants: buildPhoneVariants(chat.phone), chatTitle: chat.title },
    });
    const timeoutPromise = new Promise((resolve) => {
      window.setTimeout(() => resolve({ ok: false, error: "Lookup do CRM demorou demais." }), 20000);
    });
    const response = await Promise.race([lookupPromise, timeoutPromise]);

    if (lookupToken !== STATE.lookupToken || chat.chatKey !== STATE.currentChatKey) return;
    STATE.lookupInProgress = false;
    if (!response.ok || !response.data?.shouldMonitor) {
      notifyUi({
        status: "ignored_contact",
        contact: response.data || null,
        lastError: response.ok ? "" : response.error,
      });
      return;
    }

    STATE.approvedContact = response.data;
    startMonitoring();
    notifyUi({ status: "monitoring_contact" });

    void performBackfill({
      chatJid: chat.chatId || `${chat.phone}@c.us`,
      chatKey: chat.chatKey,
      phone: chat.phone,
      title: chat.title,
    });
  }

  async function syncMessage(message) {
    if (message?.id && STATE.processedMessages.has(message.id)) return;

    let chatJid = String(message?.chat_jid || "").trim();
    let phone = chatJid ? normalizePhone(chatJid) : "";

    // Mensagens vindas do fallback DOM não carregam chat_jid — atribui ao chat ativo.
    if (!phone) {
      phone = normalizePhone(STATE.currentPhone || "");
      chatJid = chatJid || STATE.currentChatId || (phone ? `${phone}@c.us` : "");
    }
    if (!phone) return;
    if (/@g\.us/i.test(chatJid)) return;

    const isCurrentChat = phone === normalizePhone(STATE.currentPhone || "");

    const response = await sendRuntimeMessage({
      type: "NEW_MESSAGE",
      payload: {
        phone,
        chatId: chatJid,
        chatKey: isCurrentChat ? (STATE.currentChatKey || "") : "",
        chatTitle: isCurrentChat ? (STATE.currentTitle || "") : "",
        message,
      },
    });

    const skipped = Boolean(response.data?.skipped);
    if (response.ok && !skipped) {
      rememberProcessedMessage(message?.id);
    }

    if (isCurrentChat) {
      const status = response.ok && !skipped
        ? "message_synced"
        : response.data?.reason === "not_approved"
          ? "ignored_contact"
          : "sync_failed";
      notifyUi({
        status,
        lastError: response.ok ? "" : response.error,
        lastSyncAt: response.ok && !skipped ? new Date().toISOString() : "",
      });
    }
  }

  function enqueueStructuredMessage(message) {
    const chatJid = String(message?.chat_jid || "").toLowerCase();
    if (chatJid && /@g\.us/i.test(chatJid)) return;

    const normalized = normalizeCapturedMessage(message);
    if (!normalized?.id) return;
    if (STATE.processedMessages.has(normalized.id)) return;

    if (!STATE.pendingStructuredMessages.some((item) => item.id === normalized.id)) {
      STATE.pendingStructuredMessages.push(normalized);
    }
    if (STATE.pendingStructuredMessages.length > MAX_PENDING_MESSAGES) {
      STATE.pendingStructuredMessages.splice(0, STATE.pendingStructuredMessages.length - MAX_PENDING_MESSAGES);
    }
    scheduleMessageScan();
  }

  async function scanVisibleMessages() {
    window.clearTimeout(STATE.scanTimer);
    if (STATE.processingNodes) return;

    STATE.processingNodes = true;
    try {
      const structuredMessages = STATE.pendingStructuredMessages.splice(0);
      for (const message of structuredMessages) {
        if (!message || STATE.processedMessages.has(message.id)) continue;
        await syncMessage(message);
      }
    } finally {
      STATE.processingNodes = false;
    }
  }

  async function performBackfill({ chatJid, chatKey, phone, title }) {
    if (!chatJid || !phone) return;
    if (STATE.backfilledChats.has(chatJid)) return;
    STATE.backfilledChats.add(chatJid);

    try {
      const bridge = getBridge();
      if (!bridge?.getChatHistory) return;

      const messages = await bridge.getChatHistory(chatJid, 500);
      if (!Array.isArray(messages) || messages.length === 0) return;

      const response = await sendRuntimeMessage({
        type: "BACKFILL_CHAT",
        payload: {
          phone,
          chatId: chatJid,
          chatKey: chatKey || "",
          chatTitle: title || "",
          messages,
        },
      });

      if (response.ok) {
        for (const msg of messages) {
          if (msg?.id) rememberProcessedMessage(msg.id);
        }
        notifyUi({
          status: "message_synced",
          lastError: "",
          lastSyncAt: new Date().toISOString(),
        });
      } else {
        STATE.backfilledChats.delete(chatJid);
        notifyUi({ status: "sync_failed", lastError: response.error || "Backfill falhou" });
      }
    } catch (error) {
      STATE.backfilledChats.delete(chatJid);
      console.warn("[Pipa] backfill falhou:", error);
    }
  }

  function scheduleEvaluate(delay = 250) {
    window.clearTimeout(STATE.evaluateTimer);
    STATE.evaluateTimer = window.setTimeout(() => {
      void evaluateActiveChat();
    }, delay);
  }

  function scheduleMessageScan(delay = 120) {
    window.clearTimeout(STATE.scanTimer);
    STATE.scanTimer = window.setTimeout(() => {
      void scanVisibleMessages();
    }, delay);
  }

  function startObserver() {
    const layoutObserver = new MutationObserver((mutations) => {
      let hasChatChange = false;

      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          hasChatChange = true;
          continue;
        }

        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.id === "main" || node.closest?.("#main") || node.querySelector?.("#main, header, [role='region']")) {
            hasChatChange = true;
          }
        }
      }

      if (hasChatChange) {
        scheduleEvaluate();
      }
    });

    layoutObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["title", "aria-label"],
    });
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && (changes.pipa_crm_session_v1 || changes.pipa_crm_session_v2)) {
      STATE.lookupToken += 1;
      STATE.currentChatKey = null;
      STATE.currentChatId = null;
      STATE.currentPhone = null;
      STATE.currentTitle = null;
      STATE.currentSource = "none";
      STATE.processedMessages = new Set();
      STATE.backfilledChats = new Set();
      stopMonitoring();
      scheduleEvaluate(50);
    }
  });

  async function handleApproveRequest(detail) {
    const chatKeyAtRequest = STATE.currentChatKey;
    if (!chatKeyAtRequest) return;
    if (detail?.chatKey && detail.chatKey !== chatKeyAtRequest) return;
    if (!STATE.currentPhone) {
      notifyUi({ status: "missing_phone", lastError: "Telefone não identificado." });
      return;
    }

    notifyUi({ status: "checking_contact", lastError: "" });

    const response = await sendRuntimeMessage({
      type: "CRM_APPROVE_CONTACT",
      payload: {
        phone: STATE.currentPhone,
        chatId: STATE.currentChatId || "",
        chatKey: STATE.currentChatKey || "",
        chatTitle: STATE.currentTitle || "",
        pushName: detail?.pushName || STATE.currentTitle || "",
      },
    });

    if (chatKeyAtRequest !== STATE.currentChatKey) return;

    if (!response.ok || !response.data?.shouldMonitor) {
      notifyUi({
        status: "ignored_contact",
        lastError: response.ok ? "CRM não confirmou o contato." : response.error,
      });
      return;
    }

    STATE.approvedContact = response.data;
    STATE.lookupToken += 1;
    startMonitoring();
    notifyUi({ status: "monitoring_contact", contact: response.data, lastError: "" });

    void performBackfill({
      chatJid: STATE.currentChatId || `${STATE.currentPhone}@c.us`,
      chatKey: STATE.currentChatKey || "",
      phone: STATE.currentPhone,
      title: STATE.currentTitle,
    });
  }

  window.addEventListener("pipa:approve-contact", (event) => {
    void handleApproveRequest(event.detail || {});
  });

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.channel !== "pipa-wa-res" || data.event !== "WA_MESSAGE") return;
    enqueueStructuredMessage(data.data);
  });

  void bootStructuredBridge().finally(() => scheduleEvaluate(800));
  startObserver();
  scheduleEvaluate(800);
})();
