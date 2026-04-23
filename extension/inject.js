(function () {
  "use strict";

  if (window.__pipaWaBridgeInjected) return;
  window.__pipaWaBridgeInjected = true;

  const EXTENSION_SOURCE = "pipa-extension";
  const BRIDGE_SOURCE = "pipa-wa-bridge";
  const REQUEST_TARGET = "pipa-wa-bridge";
  const RESPONSE_TARGET = "pipa-extension";
  const ORIGIN = window.location.origin || "*";

  const SELECTORS = {
    appRoot: "#app",
    chatList: "[data-testid='chat-list'], #pane-side",
    qrCanvas: "canvas[aria-label], [data-testid='qrcode'] canvas",
    loadingLabel: "[data-testid='intro-md-beta-logo'], progress",
    headerTitle: [
      "header span[data-testid='conversation-info-header-chat-title']",
      "#main header [data-testid='conversation-info-header-chat-title']",
      "header [role='button'] span[dir='auto']",
      "#main header span[title]",
    ].join(", "),
    selectedChatRow: [
      "#pane-side [aria-selected='true']",
      "#pane-side [data-testid='cell-frame-container'][aria-selected='true']",
      "#pane-side div[role='listitem'][aria-selected='true']",
      "#pane-side [data-id].selected",
    ].join(", "),
    messageContainer: [
      "[data-testid='conversation-panel-messages']",
      "#main [role='application']",
      "#main .copyable-area > div[tabindex='-1']",
      "#main .copyable-area",
    ].join(", "),
    messageRow: [
      "[data-testid='msg-container']",
      "[data-pre-plain-text]",
      ".message-in",
      ".message-out",
    ].join(", "),
    audioIndicators: [
      "audio",
      "[data-icon*='ptt']",
      "[data-icon*='audio']",
      "[data-testid*='ptt']",
      "[data-testid*='audio']",
      "[aria-label*='voice' i]",
      "[aria-label*='udio' i]",
      "[title*='voice' i]",
      "[title*='udio' i]",
    ].join(", "),
    mediaIndicators: [
      "img",
      "video",
      "canvas",
      "[data-icon*='media']",
      "[data-icon*='image']",
      "[data-icon*='video']",
      "[data-icon*='document']",
      "[data-testid*='media']",
      "[data-testid*='image']",
      "[data-testid*='video']",
    ].join(", "),
    removableMeta: [
      "[data-testid='msg-meta']",
      "[data-testid='msg-status']",
      "[data-icon='msg-dblcheck']",
      "[data-icon='msg-check']",
      "[data-icon='msg-time']",
      "button",
      "[role='button']",
      "audio",
      "video",
      "svg[aria-label]",
    ].join(", "),
  };

  const bridgeState = {
    bridge_version: 1,
    started_at: new Date().toISOString(),
    last_event_at: null,
    wa_state: "booting",
    source: "dom",
    capabilities: {},
    current_chat: null,
    current_snapshot: null,
  };

  let observer = null;
  let heartbeatTimer = null;
  let mutationDebounceTimer = null;
  let lastSnapshotKey = "";

  function nowIso() {
    return new Date().toISOString();
  }

  function normalizePhone(value) {
    const digits = String(value || "").replace(/\D/g, "");
    return digits.length >= 10 ? digits : null;
  }

  function slugify(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function normalizeText(value) {
    return String(value || "")
      .replace(/\u200e/g, "")
      .replace(/\u200f/g, "")
      .replace(/\u00a0/g, " ")
      .replace(/\r/g, "")
      .replace(/\s+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function findFirst(selectorList, root = document) {
    if (!selectorList) return null;
    const selectors = Array.isArray(selectorList) ? selectorList : String(selectorList).split(",").map((item) => item.trim()).filter(Boolean);
    for (const selector of selectors) {
      try {
        const node = root.querySelector(selector);
        if (node) return node;
      } catch (_error) {
        // ignore selector drift
      }
    }
    return null;
  }

  function createLineFingerprint(value) {
    const input = normalizeText(value).toLowerCase();
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv:${(hash >>> 0).toString(16)}`;
  }

  function getCapabilities() {
    return {
      hasWpp: Boolean(window.WPP),
      hasStore: Boolean(window.Store),
      hasDebugVersion: Boolean(window.Debug?.VERSION),
      hasWebpackChunk: Boolean(
        window.webpackChunkwhatsapp_web_client ||
        window.webpackChunkbuild ||
        window.webpackChunkwhatsapp_web
      ),
      waVersion: window.Debug?.VERSION || null,
    };
  }

  function extractChatKeyCandidate(value) {
    if (!value) return null;
    const text = String(value).trim();
    const jidMatch = text.match(/([0-9a-z._-]+)@(?:c|g)\.us/i);
    if (jidMatch?.[1]) return `wa:${jidMatch[1].toLowerCase()}`;
    const normalizedPhone = normalizePhone(text);
    if (normalizedPhone) return `wa:${normalizedPhone}`;
    const slug = slugify(text);
    return slug ? `chat:${slug}` : null;
  }

  function extractChatKeyFromElement(node) {
    if (!node) return null;
    const attrCandidates = [
      node.getAttribute?.("data-id"),
      node.getAttribute?.("data-chat-id"),
      node.getAttribute?.("data-jid"),
      node.getAttribute?.("data-testid"),
      node.getAttribute?.("aria-label"),
      node.getAttribute?.("title"),
      node.dataset?.id,
      node.dataset?.chatId,
      node.dataset?.jid,
      node.dataset?.testid,
    ];
    return attrCandidates.map(extractChatKeyCandidate).find(Boolean) || null;
  }

  function detectWaState() {
    if (!document.querySelector(SELECTORS.appRoot)) return "loading";
    if (document.querySelector(SELECTORS.qrCanvas)) return "qr";
    if (document.querySelector(SELECTORS.chatList)) return "ready";
    if (document.querySelector(SELECTORS.loadingLabel)) return "loading";
    return "unknown";
  }

  function getHeaderTitle() {
    const titleNode = findFirst(SELECTORS.headerTitle);
    const title =
      titleNode?.getAttribute?.("title") ||
      titleNode?.textContent ||
      "";
    const normalized = String(title || "").replace(/\s+/g, " ").trim();
    return normalized || null;
  }

  function getCurrentChatFromDom() {
    const displayName = getHeaderTitle();
    if (!displayName) return null;

    const selectedChatRow = document.querySelector(SELECTORS.selectedChatRow);
    const url = new URL(window.location.href);
    const candidates = [
      url.searchParams.get("phone"),
      url.hash,
      extractChatKeyFromElement(selectedChatRow),
      extractChatKeyFromElement(document.querySelector("#main header")),
      displayName,
    ];

    const phoneNumber = candidates.map(normalizePhone).find(Boolean) || null;
    const chatKey = candidates.map(extractChatKeyCandidate).find(Boolean) || null;

    return {
      chatKey: chatKey || `chat:${slugify(displayName) || "unknown"}`,
      displayName,
      phoneNumber,
      source: "dom",
    };
  }

  function getMessageContainer() {
    return findFirst(SELECTORS.messageContainer);
  }

  function getMessageRows(container = getMessageContainer()) {
    if (!container) return [];
    const rows = new Set();

    container.querySelectorAll(SELECTORS.messageRow).forEach((node) => {
      const row = node.closest?.("[data-testid='msg-container'], .message-in, .message-out") || node;
      if (row && container.contains(row)) rows.add(row);
    });

    return Array.from(rows).sort((left, right) => {
      if (left === right) return 0;
      const position = left.compareDocumentPosition(right);
      return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
  }

  function parsePrefix(prefix) {
    const cleanPrefix = normalizeText(prefix).replace(/\s+$/, "");
    if (!cleanPrefix) return { prefix: "", timeLabel: "", sender: "" };

    const match = cleanPrefix.match(/^\[(.+?)\]\s([^:]+):\s*$/);
    if (!match) return { prefix: cleanPrefix, timeLabel: "", sender: "" };
    return {
      prefix: cleanPrefix,
      timeLabel: normalizeText(match[1]),
      sender: normalizeText(match[2]),
    };
  }

  function hasSelector(root, selectors) {
    const selectorList = Array.isArray(selectors)
      ? selectors
      : String(selectors).split(",").map((item) => item.trim()).filter(Boolean);
    return selectorList.some((selector) => {
      try {
        return Boolean(root.matches?.(selector) || root.querySelector?.(selector));
      } catch (_error) {
        return false;
      }
    });
  }

  function detectDirection(row) {
    if (
      row.classList.contains("message-out") ||
      row.querySelector("[data-testid='msg-status']") ||
      row.querySelector("[data-icon='msg-dblcheck']") ||
      row.querySelector("[data-icon='msg-check']")
    ) {
      return "outbound";
    }
    return "inbound";
  }

  function cloneTextWithoutMeta(node) {
    if (!node) return "";
    const clone = node.cloneNode(true);
    clone.querySelectorAll(SELECTORS.removableMeta).forEach((element) => element.remove());
    return normalizeText(clone.innerText || clone.textContent || "");
  }

  function extractAudioDuration(row) {
    const values = [];
    row.querySelectorAll("span, div").forEach((node) => {
      if (node.closest("[data-testid='msg-meta'], [data-testid='msg-status']")) return;
      const text = normalizeText(node.textContent || "");
      if (/^\d{1,2}:\d{2}$/.test(text) && !values.includes(text)) values.push(text);
    });
    return values[0] || "";
  }

  function extractMessageText(row, prefixData) {
    const candidates = [
      row.querySelector("span.selectable-text"),
      row.querySelector("[data-testid='balloon-text']"),
      row.querySelector(".copyable-text"),
      row.querySelector("[dir='auto']"),
    ].filter(Boolean);

    let bestText = "";
    candidates.forEach((candidate) => {
      const text = cloneTextWithoutMeta(candidate);
      if (text.length > bestText.length) bestText = text;
    });

    if (!bestText) bestText = cloneTextWithoutMeta(row);
    if (prefixData?.prefix && bestText.startsWith(prefixData.prefix)) {
      bestText = normalizeText(bestText.slice(prefixData.prefix.length));
    }
    return bestText;
  }

  function detectMessageType(row, text) {
    if (hasSelector(row, SELECTORS.audioIndicators)) return "audio";
    if (!text && hasSelector(row, SELECTORS.mediaIndicators)) return "media";
    return "text";
  }

  function buildMessageBody(row, messageType, text, direction) {
    if (messageType === "audio") {
      const duration = extractAudioDuration(row);
      return duration
        ? direction === "outbound"
          ? `[Audio enviado] (${duration})`
          : `[Audio recebido] (${duration})`
        : direction === "outbound"
          ? "[Audio enviado]"
          : "[Audio recebido]";
    }
    if (text) return text;
    if (messageType === "media") return direction === "outbound" ? "[Media enviada]" : "[Media recebida]";
    return "";
  }

  function extractRowKey(row, index) {
    const candidates = [
      row.getAttribute?.("data-id"),
      row.getAttribute?.("data-testid"),
      row.getAttribute?.("aria-label"),
      row.id,
    ];
    if (row.dataset) candidates.push(...Object.values(row.dataset));
    const found = candidates.find(Boolean);
    return found ? String(found) : `row:${index}`;
  }

  function getConversationSnapshot(chat = bridgeState.current_chat) {
    const container = getMessageContainer();
    if (!container || !chat?.chatKey) return null;

    const rows = getMessageRows(container);
    const messages = [];

    rows.forEach((row, index) => {
      const prefixNode = row.matches("[data-pre-plain-text]")
        ? row
        : row.querySelector("[data-pre-plain-text]");
      const prefixData = parsePrefix(prefixNode?.getAttribute?.("data-pre-plain-text") || "");
      const direction = detectDirection(row);
      const sender =
        prefixData.sender ||
        (direction === "outbound" ? "Eu" : chat.displayName || "Contato");
      const timeLabel =
        prefixData.timeLabel ||
        normalizeText(
          row.querySelector("[data-testid='msg-meta'] span")?.textContent ||
            row.querySelector("span[data-testid*='time']")?.textContent ||
            ""
        );
      const text = extractMessageText(row, prefixData);
      const messageType = detectMessageType(row, text);
      const body = buildMessageBody(row, messageType, text, direction);
      if (!body) return;

      const line = prefixData.prefix
        ? normalizeText(`${prefixData.prefix} ${body}`)
        : normalizeText(`${timeLabel ? `[${timeLabel}] ` : ""}${sender}: ${body}`);
      if (!line) return;

      const rowKey = extractRowKey(row, index);
      messages.push({
        direction,
        messageType,
        sender,
        sender_name: sender,
        timeLabel,
        stamp: timeLabel || null,
        body,
        line,
        raw_source: line,
        source: line,
        external_id: rowKey,
        message_fingerprint_source: `${chat.chatKey}|${rowKey}|${line}`,
        fingerprint: createLineFingerprint(line),
      });
    });

    if (!messages.length) return null;

    const lines = messages.map((message) => message.line).filter(Boolean);
    return {
      chat_key: chat.chatKey,
      line_count: messages.length,
      raw_text: lines.join("\n"),
      lines,
      messages,
      fingerprint: createLineFingerprint(`${chat.chatKey}|${lines.join("\n")}`),
      updated_at: nowIso(),
    };
  }

  function snapshotState() {
    bridgeState.last_event_at = nowIso();
    bridgeState.wa_state = detectWaState();
    bridgeState.capabilities = getCapabilities();

    const domChat = getCurrentChatFromDom();
    bridgeState.current_chat = domChat;
    bridgeState.current_snapshot = getConversationSnapshot(domChat);

    if (bridgeState.capabilities.hasWpp) {
      bridgeState.source = "wpp-ready";
    } else if (bridgeState.capabilities.hasStore) {
      bridgeState.source = "store-ready";
    } else {
      bridgeState.source = domChat ? "dom" : "bootstrap";
    }

    return {
      bridge_version: bridgeState.bridge_version,
      started_at: bridgeState.started_at,
      last_event_at: bridgeState.last_event_at,
      wa_state: bridgeState.wa_state,
      source: bridgeState.source,
      capabilities: bridgeState.capabilities,
      current_chat: bridgeState.current_chat,
      current_snapshot: bridgeState.current_snapshot,
    };
  }

  function postToExtension(message) {
    window.postMessage(
      {
        source: BRIDGE_SOURCE,
        target: RESPONSE_TARGET,
        ...message,
      },
      ORIGIN
    );
  }

  function emitSnapshot(eventType) {
    const snapshot = snapshotState();
    const snapshotKey = JSON.stringify({
      wa_state: snapshot.wa_state,
      source: snapshot.source,
      current_chat: snapshot.current_chat,
      capabilities: snapshot.capabilities,
      current_snapshot: snapshot.current_snapshot
        ? {
            chat_key: snapshot.current_snapshot.chat_key,
            line_count: snapshot.current_snapshot.line_count,
            fingerprint: snapshot.current_snapshot.fingerprint,
          }
        : null,
    });

    if (eventType !== "bridge-ready" && snapshotKey === lastSnapshotKey) return;
    lastSnapshotKey = snapshotKey;

    postToExtension({
      kind: "event",
      event: eventType,
      payload: snapshot,
    });
  }

  function respond(requestId, type, payload) {
    postToExtension({
      kind: "response",
      requestId,
      type,
      payload,
    });
  }

  function handleRequest(message) {
    const type = message?.type;
    const requestId = message?.requestId || null;
    const snapshot = snapshotState();

    switch (type) {
      case "PING":
      case "GET_STATE":
        respond(requestId, type, snapshot);
        return;
      case "GET_CHAT_CONTEXT":
        respond(requestId, type, snapshot.current_chat);
        return;
      case "GET_CAPABILITIES":
        respond(requestId, type, snapshot.capabilities);
        return;
      case "GET_CONVERSATION_SNAPSHOT":
        respond(requestId, type, snapshot.current_snapshot);
        return;
      case "FORCE_REFRESH":
        lastSnapshotKey = "";
        emitSnapshot("state-change");
        respond(requestId, type, snapshotState());
        return;
      default:
        respond(requestId, type, {
          ok: false,
          error: `Unknown bridge request: ${String(type || "")}`,
        });
    }
  }

  function handleWindowMessage(event) {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== EXTENSION_SOURCE || data.target !== REQUEST_TARGET) return;
    handleRequest(data);
  }

  function installObserver() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => {
      if (mutationDebounceTimer) window.clearTimeout(mutationDebounceTimer);
      mutationDebounceTimer = window.setTimeout(() => {
        mutationDebounceTimer = null;
        emitSnapshot("state-change");
      }, 180);
    });

    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-id", "aria-selected", "title"],
    });
  }

  function installHeartbeat() {
    if (heartbeatTimer) window.clearInterval(heartbeatTimer);
    heartbeatTimer = window.setInterval(() => {
      emitSnapshot("heartbeat");
    }, 5000);
  }

  window.addEventListener("message", handleWindowMessage);
  installObserver();
  installHeartbeat();
  emitSnapshot("bridge-ready");
})();
