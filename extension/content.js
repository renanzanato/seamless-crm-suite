// ──────────────────────────────────────────────────────────
// Pipa Driven v3 — Monitor + Tasks
// Sidebar minimalista: captura por contato + tarefas do dia
// ──────────────────────────────────────────────────────────

(function () {
  "use strict";

  if (window.__pipaInjected) return;
  window.__pipaInjected = true;

  // ── State ──────────────────────────────────────────────

  let authenticated = false;
  let session = null;
  let activePanel = null; // 'monitor' | 'tasks' | null
  let currentChat = null;
  let trackedChats = {}; // { chatKey: metadata }
  let lastMsgCount = 0;
  let autoCaptureTimer = null;
  let watcherStarted = false;
  let watchDebounce = null;
  let realtimeSyncTimer = null;
  let messageObserver = null;
  let messageObserverChatKey = null;
  let observedMessageContainer = null;
  let conversationGuardTimer = null;
  let syncInFlightChatKey = null;
  let queuedSyncChatKey = null;
  let loginPromptTimer = null;
  let bridgeReportTimer = null;
  let monitorState = createEmptyMonitorState();
  let bridgeState = createEmptyBridgeState();
  let bridgeListenerAttached = false;
  let bridgeRequestSeq = 0;
  const bridgePendingRequests = new Map();

  const BRIDGE_EXTENSION_SOURCE = "pipa-extension";
  const BRIDGE_PAGE_SOURCE = "pipa-wa-bridge";
  const BRIDGE_PAGE_TARGET = "pipa-wa-bridge";
  const BRIDGE_EXTENSION_TARGET = "pipa-extension";
  const BRIDGE_TIMEOUT_MS = 3000;

  // ── Helpers ────────────────────────────────────────────

  function createEmptyMonitorState() {
    return {
      companyQuery: "",
      companyResults: [],
      companyLoading: false,
      selectedCompany: null,
      contactQuery: "",
      contactResults: [],
      contactLoading: false,
      selectedContact: null,
      bannerTone: "",
      bannerText: "",
      busy: false,
      busyText: "",
      autoMatch: null,
      autoMatchLoading: false,
      registerMode: false,
    };
  }

  function createEmptyBridgeState() {
    return {
      injected: false,
      connected: false,
      waState: "unknown",
      source: "bootstrap",
      capabilities: {},
      currentChat: null,
      currentSnapshot: null,
      lastEventAt: null,
      startedAt: null,
    };
  }

  function msg(type, data = {}) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type, ...data }, (response) => {
          const runtimeError = chrome.runtime.lastError;
          if (runtimeError) {
            resolve({ ok: false, error: runtimeError.message || String(runtimeError) });
            return;
          }
          resolve(response || { ok: false, error: "Sem resposta do background." });
        });
      } catch (error) {
        resolve({ ok: false, error: error?.message || String(error) });
      }
    });
  }

  function normalizeBridgeChat(chat) {
    if (!chat || typeof chat !== "object") return null;
    const displayName = String(chat.displayName || "").trim();
    const chatKey = String(chat.chatKey || "").trim();
    const phoneNumber = normalizePhone(chat.phoneNumber);
    if (!displayName && !chatKey && !phoneNumber) return null;
    return {
      displayName: displayName || "Contato",
      chatKey: chatKey || null,
      phoneNumber,
      source: chat.source || bridgeState.source || "bridge",
    };
  }

  function normalizeBridgeSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return null;
    const chatKey = String(snapshot.chat_key || snapshot.chatKey || "").trim();
    const rawText = String(snapshot.raw_text || snapshot.rawText || "").trim();
    const lines = Array.isArray(snapshot.lines)
      ? snapshot.lines.map((line) => normalizeExtractedText(line)).filter(Boolean)
      : rawText
        ? rawText.split("\n").map((line) => normalizeExtractedText(line)).filter(Boolean)
        : [];
    const messages = Array.isArray(snapshot.messages)
      ? snapshot.messages
          .map((message) => {
            if (!message || typeof message !== "object") return null;
            const line = normalizeExtractedText(message.line || "");
            const body = normalizeExtractedText(message.body || "");
            const direction = message.direction === "outbound" ? "outbound" : "inbound";
            const messageType = String(message.messageType || message.message_type || "text").toLowerCase();
            const sender = normalizeExtractedText(message.sender || message.sender_name || "");
            const timeLabel = normalizeExtractedText(message.timeLabel || message.stamp || "");
            const resolvedLine =
              line ||
              normalizeExtractedText(
                `${timeLabel ? `[${timeLabel}] ` : ""}${sender || (direction === "outbound" ? "Eu" : "Contato")}: ${body}`
              );
            return {
              direction,
              messageType,
              sender: sender || (direction === "outbound" ? "Eu" : "Contato"),
              sender_name: sender || (direction === "outbound" ? "Eu" : "Contato"),
              timeLabel,
              stamp: timeLabel || null,
              body,
              line: resolvedLine,
              raw_source: message.raw_source || message.source || resolvedLine,
              source: message.source || resolvedLine,
              external_id: message.external_id || message.id || null,
              message_fingerprint_source:
                message.message_fingerprint_source ||
                message.external_id ||
                resolvedLine,
              fingerprint: message.fingerprint || createLineFingerprint(resolvedLine),
              media: Array.isArray(message.media) ? message.media : [],
            };
          })
          .filter(Boolean)
      : [];

    const normalizedRawText = rawText || lines.join("\n");
    if (!chatKey && !normalizedRawText && !messages.length) return null;

    return {
      chatKey: chatKey || null,
      rawText: normalizedRawText,
      lineCount: Number(snapshot.line_count || snapshot.lineCount || messages.length || lines.length || 0),
      lines: lines.length ? lines : messages.map((message) => message.line).filter(Boolean),
      messages,
      fingerprint: snapshot.fingerprint || null,
      updatedAt: snapshot.updated_at || snapshot.updatedAt || null,
    };
  }

  function scheduleBridgeStateReport() {
    if (bridgeReportTimer) window.clearTimeout(bridgeReportTimer);
    bridgeReportTimer = window.setTimeout(() => {
      bridgeReportTimer = null;
      void msg("REPORT_WA_BRIDGE_STATE", {
        snapshot: {
          connected: bridgeState.connected,
          injected: bridgeState.injected,
          wa_state: bridgeState.waState,
          source: bridgeState.source,
          current_chat: bridgeState.currentChat,
          last_event_at: bridgeState.lastEventAt,
          capabilities: bridgeState.capabilities,
        },
      });
    }, 250);
  }

  function mergeBridgeState(snapshot, options = {}) {
    if (!snapshot || typeof snapshot !== "object") return bridgeState;
    const nextChat = normalizeBridgeChat(snapshot.current_chat || snapshot.currentChat);
    const nextSnapshot = normalizeBridgeSnapshot(snapshot.current_snapshot || snapshot.currentSnapshot);
    bridgeState = {
      ...bridgeState,
      injected: true,
      connected: true,
      waState: snapshot.wa_state || snapshot.waState || bridgeState.waState,
      source: snapshot.source || bridgeState.source,
      capabilities:
        snapshot.capabilities && typeof snapshot.capabilities === "object"
          ? snapshot.capabilities
          : bridgeState.capabilities,
      currentChat: nextChat || bridgeState.currentChat,
      currentSnapshot:
        nextSnapshot && (!nextSnapshot.chatKey || nextSnapshot.chatKey === (nextChat?.chatKey || bridgeState.currentChat?.chatKey))
          ? nextSnapshot
          : bridgeState.currentSnapshot,
      lastEventAt: snapshot.last_event_at || snapshot.lastEventAt || bridgeState.lastEventAt,
      startedAt: snapshot.started_at || snapshot.startedAt || bridgeState.startedAt,
    };

    if (options.report !== false) {
      scheduleBridgeStateReport();
    }

    return bridgeState;
  }

  function handleBridgeWindowMessage(event) {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== BRIDGE_PAGE_SOURCE || data.target !== BRIDGE_EXTENSION_TARGET) return;

    if (data.kind === "response" && data.requestId) {
      const pending = bridgePendingRequests.get(data.requestId);
      if (!pending) return;
      bridgePendingRequests.delete(data.requestId);
      window.clearTimeout(pending.timerId);
      if (data.type === "GET_CONVERSATION_SNAPSHOT" && data.payload) {
        mergeBridgeState({ current_snapshot: data.payload }, { refreshChat: false });
      } else if (data.payload && typeof data.payload === "object" && !Array.isArray(data.payload)) {
        mergeBridgeState(data.payload, { refreshChat: false });
      }
      pending.resolve(data.payload);
      return;
    }

    if (data.kind === "event" && data.payload) {
      mergeBridgeState(data.payload, { refreshChat: false });
    }
  }

  function ensureBridgeListener() {
    if (bridgeListenerAttached) return;
    bridgeListenerAttached = true;
    window.addEventListener("message", handleBridgeWindowMessage);
  }

  function injectBridgeScript() {
    ensureBridgeListener();
    const existing = document.getElementById("pipa-wa-bridge-script");
    if (existing) {
      bridgeState.injected = true;
      return;
    }

    const script = document.createElement("script");
    script.id = "pipa-wa-bridge-script";
    script.src = chrome.runtime.getURL("inject.js");
    script.async = false;
    script.onload = () => {
      bridgeState.injected = true;
    };
    script.onerror = () => {
      console.warn("[Pipa] Falha ao injetar bridge do WhatsApp.");
    };
    (document.head || document.documentElement || document.body).appendChild(script);
  }

  function requestWaBridge(type, payload = {}, timeoutMs = BRIDGE_TIMEOUT_MS) {
    injectBridgeScript();

    return new Promise((resolve, reject) => {
      const requestId = `pipa-${Date.now()}-${++bridgeRequestSeq}`;
      const timerId = window.setTimeout(() => {
        bridgePendingRequests.delete(requestId);
        reject(new Error(`Bridge timeout: ${type}`));
      }, timeoutMs);

      bridgePendingRequests.set(requestId, { resolve, reject, timerId });

      window.postMessage(
        {
          source: BRIDGE_EXTENSION_SOURCE,
          target: BRIDGE_PAGE_TARGET,
          requestId,
          type,
          payload,
        },
        window.location.origin
      );
    });
  }

  async function bootstrapWaBridge() {
    injectBridgeScript();
    try {
      const snapshot = await requestWaBridge("PING");
      mergeBridgeState(snapshot, { refreshChat: false });
      return bridgeState;
    } catch (error) {
      console.warn("[Pipa] WhatsApp bridge indisponivel:", error);
      return null;
    }
  }

  async function checkAuth() {
    const res = await msg("GET_SESSION");
    if (res.ok && res.data) {
      session = res.data;
      authenticated = true;
      return true;
    }
    return false;
  }

  function timeAgo(ts) {
    if (!ts) return "nunca";
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60000);
    if (min < 1) return "agora";
    if (min < 60) return `${min} min`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `${hrs}h`;
    return "ontem";
  }

  function normalizePhone(value) {
    if (!value) return null;
    const digits = String(value).replace(/\D/g, "");
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

  function countMessageLines(text) {
    return String(text || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean).length;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setMonitorBanner(tone, text) {
    monitorState.bannerTone = tone || "";
    monitorState.bannerText = text || "";
  }

  function setMonitorBusy(active, text = "") {
    monitorState.busy = active;
    monitorState.busyText = text;
  }

  function clearMonitorFeedback() {
    setMonitorBanner("", "");
    setMonitorBusy(false, "");
  }

  function rerenderMonitor() {
    if (activePanel !== "monitor") return;
    const container = document.getElementById("pipa-panel-container");
    if (container) renderMonitorPanel(container);
  }

  function derivePersonaType(contact) {
    const role = String(contact?.role || "").toLowerCase();
    if (!role) return "dir_comercial";
    if (role.includes("marketing")) return "marketing";
    if (role.includes("ceo") || role.includes("founder") || role.includes("socio") || role.includes("diretor")) {
      return "decision_maker";
    }
    if (role.includes("comercial") || role.includes("sales") || role.includes("vendas")) {
      return "dir_comercial";
    }
    return "dir_comercial";
  }

  function getTrackedEntry(chatKey) {
    if (!chatKey) return null;
    return trackedChats[chatKey] || null;
  }

  const WA_SELECTORS = {
    conversationHeader: [
      "header span[data-testid='conversation-info-header-chat-title']",
      "#main header [data-testid='conversation-info-header-chat-title']",
      "header [role='button'] span[dir='auto']",
      "#main header span[title]",
    ],
    messageContainer: [
      "[data-testid='conversation-panel-messages']",
      "#main [role='application']",
      "#main .copyable-area > div[tabindex='-1']",
      "#main .copyable-area",
    ],
    messageRow: [
      "[data-testid='msg-container']",
      "[data-pre-plain-text]",
      ".message-in",
      ".message-out",
    ],
    scrollContainer: [
      "[data-testid='conversation-panel-body']",
      "#main [data-testid='conversation-panel-body']",
    ],
    selectedChatRow: [
      "#pane-side [aria-selected='true']",
      "#pane-side [data-testid='cell-frame-container'][aria-selected='true']",
      "#pane-side div[role='listitem'][aria-selected='true']",
      "#pane-side [data-id].selected",
    ],
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
    ],
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
    ],
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
    ],
  };

  function queryFirst(selectors, root = document) {
    for (const selector of selectors) {
      try {
        const node = root.querySelector(selector);
        if (node) return node;
      } catch (error) {
        // ignore selector drift
      }
    }
    return null;
  }

  function hashString(value) {
    let hash = 2166136261;
    const input = String(value || "");
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function resetMonitorSelections() {
    monitorState.companyQuery = "";
    monitorState.companyResults = [];
    monitorState.companyLoading = false;
    monitorState.selectedCompany = null;
    monitorState.contactQuery = "";
    monitorState.contactResults = [];
    monitorState.contactLoading = false;
    monitorState.selectedContact = null;
  }

  function hydrateMonitorStateFromCurrentChat() {
    clearMonitorFeedback();
    monitorState.companyResults = [];
    monitorState.contactResults = [];
    monitorState.companyLoading = false;
    monitorState.contactLoading = false;

    if (!currentChat) {
      resetMonitorSelections();
      return;
    }

    const tracked = getTrackedEntry(currentChat.chatKey);
    if (!tracked) {
      resetMonitorSelections();
      monitorState.contactQuery = currentChat.displayName || "";
      return;
    }

    monitorState.companyQuery = tracked.companyName || "";
    monitorState.selectedCompany = tracked.companyId
      ? {
          id: tracked.companyId,
          name: tracked.companyName,
          buying_signal: tracked.buyingSignal || null,
          cadence_day: tracked.cadenceDay || null,
          cadence_status: tracked.cadenceStatus || null,
        }
      : null;
    monitorState.contactQuery = tracked.contactName || currentChat.displayName || "";
    monitorState.selectedContact = tracked.contactId
      ? {
          id: tracked.contactId,
          name: tracked.contactName,
          role: tracked.contactRole || null,
          whatsapp: tracked.phoneNumber || null,
          email: tracked.contactEmail || null,
        }
      : null;
  }

  // ── Tracked Chats Storage ─────────────────────────────

  async function loadTrackedChats() {
    const result = await chrome.storage.local.get([
      "pipa_tracked_chats",
      "pipa_tracked",
    ]);

    if (result.pipa_tracked_chats) {
      trackedChats = result.pipa_tracked_chats;
      return;
    }

    const legacy = result.pipa_tracked || {};
    trackedChats = {};

    Object.entries(legacy).forEach(([displayName, info]) => {
      const chatKey = `chat:${slugify(displayName) || "legacy"}`;
      trackedChats[chatKey] = {
        chatKey,
        displayName,
        enabled: Boolean(info?.enabled),
        lastSync: info?.lastSync || 0,
        msgCount: info?.msgCount || 0,
        companyId: info?.companyId || null,
        companyName: info?.companyName || null,
        contactId: info?.contactId || null,
        contactName: info?.contactName || displayName,
        contactRole: info?.contactRole || null,
        contactEmail: info?.contactEmail || null,
        phoneNumber: info?.phoneNumber || null,
        personaType: info?.personaType || "dir_comercial",
        lastFingerprint: info?.lastFingerprint || null,
        lastTailFingerprint: info?.lastTailFingerprint || null,
        lastRawText: info?.lastRawText || null,
      };
    });

    await saveTrackedChats();
  }

  async function saveTrackedChats() {
    const legacyTracked = {};
    Object.values(trackedChats).forEach((entry) => {
      legacyTracked[entry.displayName || entry.chatKey] = {
        enabled: entry.enabled,
        lastSync: entry.lastSync || 0,
        msgCount: entry.msgCount || 0,
        companyId: entry.companyId || null,
        companyName: entry.companyName || null,
        contactId: entry.contactId || null,
        contactName: entry.contactName || null,
        contactRole: entry.contactRole || null,
        contactEmail: entry.contactEmail || null,
        phoneNumber: entry.phoneNumber || null,
        personaType: entry.personaType || "dir_comercial",
        lastFingerprint: entry.lastFingerprint || null,
        lastTailFingerprint: entry.lastTailFingerprint || null,
      };
    });

    await chrome.storage.local.set({
      pipa_tracked_chats: trackedChats,
      pipa_tracked: legacyTracked,
    });
  }

  // ── SVG Icons ──────────────────────────────────────────

  const ICONS = {
    logo: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="6" fill="#f97316"/><text x="12" y="16" text-anchor="middle" fill="white" font-size="13" font-weight="800" font-family="sans-serif">P</text></svg>`,
    monitor: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/><path d="M7.76 16.24a6 6 0 0 1 0-8.49"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 19.07a10 10 0 0 1 0-14.14"/></svg>`,
    tasks: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
    capture: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    close: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    refresh: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`,
    copy: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
    send: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
    skip: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>`,
    contact: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    trash: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
    search: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    link: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
    building: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M8 10h.01"/><path d="M16 10h.01"/><path d="M8 14h.01"/><path d="M16 14h.01"/></svg>`,
  };

  // ── DOM Selectors (WhatsApp Web) ───────────────────────

  function getConversationHeader() {
    return queryFirst(WA_SELECTORS.conversationHeader);
  }

  function getMessageContainer() {
    return queryFirst(WA_SELECTORS.messageContainer);
  }

  function getSelectedChatRow() {
    return queryFirst(WA_SELECTORS.selectedChatRow);
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function normalizeExtractedText(value) {
    return String(value || "")
      .replace(/\u200e/g, "")
      .replace(/\u200f/g, "")
      .replace(/\u00a0/g, " ")
      .replace(/\r/g, "")
      .replace(/\s+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function createLineFingerprint(value) {
    return hashString(normalizeExtractedText(value).toLowerCase());
  }

  function createSnapshotFingerprint(chatKey, lineFingerprints) {
    return `${lineFingerprints.length}:${hashString(
      `${chatKey || "chat"}::${lineFingerprints.join("|")}`
    )}`;
  }

  function extractChatKeyCandidate(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;

    const phone = normalizePhone(raw);
    if (phone) return `wa:${phone}`;

    const jidMatch = raw.match(/([0-9a-z._-]+)@(?:c|g)\.us/i);
    if (jidMatch?.[1]) return `wa:${jidMatch[1].toLowerCase()}`;

    const chatMatch = raw.match(/chat(?:key|id)?[:=/\s-]*([0-9a-z._-]{6,})/i);
    if (chatMatch?.[1]) return `wa:${chatMatch[1].toLowerCase()}`;

    return null;
  }

  function extractChatKeyFromElement(element) {
    if (!element) return null;

    const candidates = [];
    const pushCandidate = (value) => {
      if (value && !candidates.includes(value)) candidates.push(value);
    };

    [
      "data-id",
      "data-chat-id",
      "data-jid",
      "data-testid",
      "aria-label",
      "title",
      "href",
      "id",
    ].forEach((attribute) => {
      pushCandidate(element.getAttribute?.(attribute));
    });

    if (element.dataset) {
      Object.values(element.dataset).forEach(pushCandidate);
    }

    const nested = element.querySelectorAll?.(
      "[data-id], [data-chat-id], [data-jid], a[href], [title], [aria-label]"
    );
    if (nested?.length) {
      Array.from(nested)
        .slice(0, 12)
        .forEach((node) => {
          [
            "data-id",
            "data-chat-id",
            "data-jid",
            "href",
            "title",
            "aria-label",
          ].forEach((attribute) => {
            pushCandidate(node.getAttribute?.(attribute));
          });
          if (node.dataset) {
            Object.values(node.dataset).forEach(pushCandidate);
          }
        });
    }

    for (const candidate of candidates) {
      const chatKey = extractChatKeyCandidate(candidate);
      if (chatKey) return chatKey;
    }

    return null;
  }

  function resolveTrackedChatKey(displayName, phoneNumber, domChatKey) {
    const fallbackKey = `chat:${slugify(displayName) || "conversation"}`;
    const candidateKeys = [
      domChatKey,
      phoneNumber ? `wa:${phoneNumber}` : null,
      fallbackKey,
    ].filter(Boolean);

    for (const candidate of candidateKeys) {
      if (trackedChats[candidate]) return candidate;
    }

    const displaySlug = slugify(displayName);
    const matches = Object.values(trackedChats).filter((entry) => {
      if (phoneNumber && normalizePhone(entry.phoneNumber) === phoneNumber) return true;
      return displaySlug && slugify(entry.displayName) === displaySlug;
    });
    if (matches.length === 1) {
      return matches[0].chatKey;
    }

    return domChatKey || (phoneNumber ? `wa:${phoneNumber}` : fallbackKey);
  }

  function getRenderedMessageCount() {
    const container = getMessageContainer();
    if (!container) return 0;
    const rows = getMessageRows(container);
    return rows.length;
  }

  function getMessageRows(container = getMessageContainer()) {
    if (!container) return [];

    const rows = new Set();
    WA_SELECTORS.messageRow.forEach((selector) => {
      container.querySelectorAll(selector).forEach((node) => {
        const row = node.closest?.("[data-testid='msg-container'], .message-in, .message-out") || node;
        if (row && container.contains(row)) {
          rows.add(row);
        }
      });
    });

    return Array.from(rows).sort((left, right) => {
      if (left === right) return 0;
      const position = left.compareDocumentPosition(right);
      return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
  }

  function parsePrefix(prefix) {
    const cleanPrefix = normalizeExtractedText(prefix).replace(/\s+$/, "");
    if (!cleanPrefix) return { prefix: "", timeLabel: "", sender: "" };

    const match = cleanPrefix.match(/^\[(.+?)\]\s([^:]+):\s*$/);
    if (match) {
      return {
        prefix: cleanPrefix,
        timeLabel: normalizeExtractedText(match[1]),
        sender: normalizeExtractedText(match[2]),
      };
    }

    return {
      prefix: cleanPrefix,
      timeLabel: "",
      sender: "",
    };
  }

  function detectMessageDirection(row, prefixData) {
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

  function getSelfSenderLabel() {
    const profileName = normalizeExtractedText(session?.profile?.name || "");
    if (profileName) return profileName;
    const emailName = normalizeExtractedText(String(session?.user?.email || "").split("@")[0] || "");
    if (emailName) return emailName;
    return "Eu";
  }

  function hasMatchingSelector(root, selectors) {
    return selectors.some((selector) => {
      try {
        return Boolean(root.matches?.(selector) || root.querySelector?.(selector));
      } catch (error) {
        return false;
      }
    });
  }

  function cleanseTextClone(node) {
    if (!node) return "";
    const clone = node.cloneNode(true);
    WA_SELECTORS.removableMeta.forEach((selector) => {
      clone.querySelectorAll(selector).forEach((element) => element.remove());
    });
    return normalizeExtractedText(clone.innerText || clone.textContent || "");
  }

  function extractAudioDuration(row) {
    const candidates = [];
    row.querySelectorAll("span, div").forEach((node) => {
      if (node.closest("[data-testid='msg-meta'], [data-testid='msg-status']")) return;
      const text = normalizeExtractedText(node.textContent || "");
      if (/^\d{1,2}:\d{2}$/.test(text) && !candidates.includes(text)) {
        candidates.push(text);
      }
    });
    return candidates[0] || "";
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
      const text = cleanseTextClone(candidate);
      if (text.length > bestText.length) {
        bestText = text;
      }
    });

    if (!bestText) {
      bestText = cleanseTextClone(row);
    }

    if (prefixData?.prefix && bestText.startsWith(prefixData.prefix)) {
      bestText = normalizeExtractedText(bestText.slice(prefixData.prefix.length));
    }

    return bestText;
  }

  function detectMessageType(row, text) {
    if (hasMatchingSelector(row, WA_SELECTORS.audioIndicators)) return "audio";
    if (!text && hasMatchingSelector(row, WA_SELECTORS.mediaIndicators)) return "media";
    return "text";
  }

  function buildMessageBody(row, messageType, text) {
    if (messageType === "audio") {
      const duration = extractAudioDuration(row);
      return duration ? `[Audio] (${duration})` : "[Audio]";
    }

    if (text) return text;
    if (messageType === "media") return "[Media]";
    return "";
  }

  function extractStructuredMessages(chat = currentChat) {
    const container = getMessageContainer();
    if (!container) return [];

    const rows = getMessageRows(container);
    const messages = [];

    rows.forEach((row) => {
      const prefixNode = row.matches("[data-pre-plain-text]")
        ? row
        : row.querySelector("[data-pre-plain-text]");
      const prefixData = parsePrefix(prefixNode?.getAttribute?.("data-pre-plain-text") || "");
      const direction = detectMessageDirection(row, prefixData);
      const sender =
        prefixData.sender ||
        (direction === "outbound" ? getSelfSenderLabel() : chat?.displayName || "Contato");
      const timeLabel =
        prefixData.timeLabel ||
        normalizeExtractedText(
          row.querySelector("[data-testid='msg-meta'] span")?.textContent ||
            row.querySelector("span[data-testid*='time']")?.textContent ||
            ""
        );
      const text = extractMessageText(row, prefixData);
      const messageType = detectMessageType(row, text);
      const body = buildMessageBody(row, messageType, text);
      if (!body) return;

      const line = prefixData.prefix
        ? normalizeExtractedText(`${prefixData.prefix} ${body}`)
        : normalizeExtractedText(
            `${timeLabel ? `[${timeLabel}] ` : ""}${sender}: ${body}`
          );
      if (!line) return;

      messages.push({
        direction,
        messageType,
        sender,
        timeLabel,
        line,
        fingerprint: createLineFingerprint(line),
      });
    });

    if (!messages.length) {
      const fallbackText = normalizeExtractedText(document.querySelector("#main")?.innerText || "");
      if (fallbackText) {
        const lines = fallbackText
          .split("\n")
          .map((line) => normalizeExtractedText(line))
          .filter(Boolean);
        return lines.map((line) => ({
          direction: "inbound",
          messageType: line.includes("[Audio]") ? "audio" : "text",
          sender: chat?.displayName || "Contato",
          timeLabel: "",
          line,
          fingerprint: createLineFingerprint(line),
        }));
      }
    }

    return messages;
  }

  function createConversationSnapshot(chat = currentChat) {
    const bridgeSnapshot = bridgeState.currentSnapshot;
    const bridgeChat = bridgeState.currentChat;
    const bridgeMatchesChat =
      !chat?.chatKey ||
      !bridgeSnapshot?.chatKey ||
      bridgeSnapshot.chatKey === chat.chatKey ||
      bridgeChat?.chatKey === bridgeSnapshot?.chatKey ||
      (bridgeChat?.phoneNumber && bridgeChat.phoneNumber === chat?.phoneNumber) ||
      (bridgeChat?.displayName && bridgeChat.displayName === chat?.displayName);
    if (
      bridgeSnapshot?.rawText &&
      bridgeMatchesChat
    ) {
      const bridgeMessages = Array.isArray(bridgeSnapshot.messages) && bridgeSnapshot.messages.length
        ? bridgeSnapshot.messages.map((message) => ({
            ...message,
            fingerprint: message.fingerprint || createLineFingerprint(message.line),
          }))
        : [];
      const bridgeLines = bridgeSnapshot.lines?.length
        ? bridgeSnapshot.lines
        : bridgeMessages.map((message) => message.line).filter(Boolean);
      const lineFingerprints = bridgeMessages.length
        ? bridgeMessages.map((message) => message.fingerprint)
        : bridgeLines.map((line) => createLineFingerprint(line));

      return {
        messages: bridgeMessages,
        lines: bridgeLines,
        rawText: bridgeSnapshot.rawText,
        lineCount: bridgeSnapshot.lineCount || bridgeMessages.length || bridgeLines.length,
        lineFingerprints,
        fingerprint:
          bridgeSnapshot.fingerprint || createSnapshotFingerprint(chat?.chatKey, lineFingerprints),
        tailFingerprint: createSnapshotFingerprint(
          chat?.chatKey,
          lineFingerprints.slice(-8)
        ),
        source: "bridge",
      };
    }

    const messages = extractStructuredMessages(chat);
    const lines = messages.map((message) => message.line).filter(Boolean);
    const rawText = lines.join("\n");
    const lineFingerprints = messages.map((message) => message.fingerprint);
    const lineCount = messages.length;
    return {
      messages,
      lines,
      rawText,
      lineCount,
      lineFingerprints,
      fingerprint: createSnapshotFingerprint(chat?.chatKey, lineFingerprints),
      tailFingerprint: createSnapshotFingerprint(
        chat?.chatKey,
        lineFingerprints.slice(-8)
      ),
      source: "dom",
    };
  }

  // ── Retroactive Capture (scroll to load old messages) ──

  function getScrollContainer() {
    const panel = queryFirst(WA_SELECTORS.scrollContainer);
    if (panel) return panel;

    const msgContainer = getMessageContainer();
    if (!msgContainer) return null;

    let el = msgContainer;
    for (let i = 0; i < 8; i += 1) {
      el = el.parentElement;
      if (!el) break;
      if (el.scrollHeight > el.clientHeight + 50) return el;
    }

    return msgContainer.parentElement;
  }

  async function loadAllMessages(onProgress) {
    const scrollEl = getScrollContainer();
    if (!scrollEl) return;

    let lastTopSignature = "";
    let lastCount = getRenderedMessageCount();
    let stableCount = 0;
    let round = 0;

    while (round < 30) {
      round += 1;
      scrollEl.scrollTop = 0;
      scrollEl.dispatchEvent(new Event("scroll", { bubbles: true }));
      await sleep(260);
      await requestWaBridge("FORCE_REFRESH", {}, 800).catch(() => null);

      const currentSnapshot = createConversationSnapshot(currentChat);
      const currentCount = currentSnapshot.lineCount;
      const topSignature = currentSnapshot.lineFingerprints.slice(0, 3).join("|");

      const isStable =
        scrollEl.scrollTop === 0 &&
        currentCount === lastCount &&
        topSignature === lastTopSignature;

      if (onProgress) {
        onProgress({
          round,
          currentCount,
        });
      }

      if (isStable) {
        stableCount += 1;
        if (stableCount >= 3) break;
      } else {
        stableCount = 0;
        lastCount = currentCount;
        lastTopSignature = topSignature;
      }
    }

    scrollEl.scrollTop = scrollEl.scrollHeight;
    await sleep(300);
  }

  function getCurrentContactName() {
    const header = getConversationHeader();
    if (header) {
      return header.getAttribute("title") || header.textContent?.trim() || "";
    }
    return "";
  }

  function getCurrentChatContext() {
    const bridgeChat = normalizeBridgeChat(bridgeState.currentChat);
    const displayName = bridgeChat?.displayName || getCurrentContactName();
    if (!displayName && !bridgeChat?.chatKey) return null;

    const url = new URL(window.location.href);
    const selectedChatRow = getSelectedChatRow();
    const header = document.querySelector("#main header");
    const candidates = [
      bridgeChat?.phoneNumber,
      bridgeChat?.chatKey,
      url.searchParams.get("phone"),
      url.hash,
      extractChatKeyFromElement(selectedChatRow),
      extractChatKeyFromElement(header),
      displayName,
      header?.querySelector("span[title^='+']")?.getAttribute("title"),
      header?.querySelector("[title*='55']")?.getAttribute("title"),
    ];

    let phoneNumber = null;
    for (const candidate of candidates) {
      const normalized = normalizePhone(candidate);
      if (normalized) {
        phoneNumber = normalized;
        break;
      }
    }

    const domChatKey = candidates
      .map((candidate) => extractChatKeyCandidate(candidate))
      .find(Boolean);
    const preferredChatKey = bridgeChat?.chatKey || domChatKey;
    const chatKey = resolveTrackedChatKey(
      displayName || bridgeChat?.displayName,
      bridgeChat?.phoneNumber || phoneNumber,
      preferredChatKey
    );

    return {
      chatKey,
      displayName: displayName || bridgeChat?.displayName || "Contato",
      phoneNumber: bridgeChat?.phoneNumber || phoneNumber,
      keySource: bridgeChat?.chatKey
        ? `bridge:${bridgeChat.source || bridgeState.source || "unknown"}`
        : domChatKey
          ? "dom"
          : phoneNumber
            ? "phone"
            : "name",
      bridgeConnected: bridgeState.connected,
    };
  }

  // ── Build Sidebar ──────────────────────────────────────

  function createSidebar() {
    if (document.getElementById("pipa-sidebar")) return;

    const sidebar = document.createElement("div");
    sidebar.id = "pipa-sidebar";
    sidebar.innerHTML = `
      <div class="pipa-sb-logo" title="Pipa Driven">
        ${ICONS.logo}
      </div>
      <div class="pipa-sb-divider"></div>
      <button class="pipa-sb-btn" data-panel="monitor" title="Monitor" id="pipa-btn-monitor">
        ${ICONS.monitor}
        <span class="pipa-sb-dot" id="pipa-monitor-dot"></span>
      </button>
      <button class="pipa-sb-btn" data-action="capture" title="Capturar conversa atual (wa-js)" id="pipa-btn-capture">
        ${ICONS.capture}
      </button>
      <button class="pipa-sb-btn" data-panel="tasks" title="Tarefas do dia" id="pipa-btn-tasks">
        ${ICONS.tasks}
        <span class="pipa-sb-badge" id="pipa-tasks-badge"></span>
      </button>
      <div class="pipa-sb-spacer"></div>
      <div class="pipa-sb-user" title="${escapeHtml(session?.user?.email || '')}">
        ${(session?.profile?.name || 'P').charAt(0).toUpperCase()}
      </div>
    `;

    document.body.appendChild(sidebar);

    sidebar.querySelectorAll(".pipa-sb-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.action;
        if (action === "capture") {
          runWaJsCapture(btn);
          return;
        }
        const panel = btn.dataset.panel;
        if (!panel) return;
        if (activePanel === panel) {
          closePanel();
        } else {
          openPanel(panel);
        }
        sidebar.querySelectorAll(".pipa-sb-btn").forEach((b) => b.classList.remove("active"));
        if (activePanel) btn.classList.add("active");
      });
    });
  }

  // ── Captura via wa-js (Store do WhatsApp) ──────────────
  async function runWaJsCapture(btn) {
    if (!window.PipaCapture) {
      sidebarToast("wa-js não carregou. Recarregue a página.", "err");
      return;
    }
    if (btn.__busy) return;
    btn.__busy = true;
    btn.classList.add("pipa-sb-busy");
    try {
      const { chat, response } = await window.PipaCapture.captureCurrentChat(200);
      const label = chat?.display_name || chat?.number_e164 || "conversa";
      const parts = [`✓ ${label}`];
      parts.push(response.contact_created ? "contato órfão criado" : "contato vinculado");
      const ins = response.messages_inserted ?? 0;
      const skip = response.messages_skipped ?? 0;
      parts.push(`${ins} msgs salvas${skip ? ` · ${skip} repetidas` : ""}`);
      sidebarToast(parts.join(" · "), "ok");
    } catch (err) {
      console.error("[Pipa] wa-js capture error:", err);
      sidebarToast(`Erro: ${err?.message || err}`, "err");
    } finally {
      btn.__busy = false;
      btn.classList.remove("pipa-sb-busy");
    }
  }

  function sidebarToast(message, tone = "ok") {
    const el = document.createElement("div");
    el.className = `pipa-sb-toast ${tone}`;
    el.textContent = message;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 300);
    }, 4500);
  }

  function updateMonitorDot() {
    const dot = document.getElementById("pipa-monitor-dot");
    if (!dot) return;
    const chat = getCurrentChatContext();
    if (chat && trackedChats[chat.chatKey]?.enabled) {
      dot.classList.add("active");
    } else {
      dot.classList.remove("active");
    }
  }

  async function updateTasksBadge() {
    const badge = document.getElementById("pipa-tasks-badge");
    if (!badge) return;
    try {
      const res = await msg("GET_TASKS");
      if (res.ok && res.data?.length) {
        badge.textContent = res.data.length;
        badge.classList.add("active");
      } else {
        badge.classList.remove("active");
      }
    } catch (e) {
      // ignore
    }
  }

  // ── Panel System ───────────────────────────────────────

  function createPanelContainer() {
    if (document.getElementById("pipa-panel-container")) return;

    const container = document.createElement("div");
    container.id = "pipa-panel-container";
    container.className = "pipa-panel-closed";
    document.body.appendChild(container);
  }

  function openPanel(panelName) {
    activePanel = panelName;
    const container = document.getElementById("pipa-panel-container");
    if (!container) return;
    container.className = "pipa-panel-open";

    currentChat = getCurrentChatContext();
    if (panelName === "monitor") {
      hydrateMonitorStateFromCurrentChat();
    }

    switch (panelName) {
      case "monitor":
        renderMonitorPanel(container);
        // Trigger auto-match if we don't have one yet
        if (currentChat && !monitorState.autoMatch && !monitorState.autoMatchLoading) {
          triggerAutoMatch(currentChat);
        }
        break;
      case "tasks":
        renderTasksPanel(container);
        break;
    }
  }

  function closePanel() {
    activePanel = null;
    const container = document.getElementById("pipa-panel-container");
    if (container) {
      container.className = "pipa-panel-closed";
      container.innerHTML = "";
    }
    document.querySelectorAll(".pipa-sb-btn").forEach((b) => b.classList.remove("active"));
  }

  function panelHeader(title, subtitle) {
    return `
      <div class="pipa-ph">
        <div class="pipa-ph-info">
          <span class="pipa-ph-title">${title}</span>
          ${subtitle ? `<span class="pipa-ph-sub">${subtitle}</span>` : ""}
        </div>
        <button class="pipa-ph-close" id="pipa-panel-close">${ICONS.close}</button>
      </div>
    `;
  }

  function bindPanelClose() {
    const closeBtn = document.getElementById("pipa-panel-close");
    if (closeBtn) closeBtn.addEventListener("click", closePanel);
  }

  // ── Monitor Panel ──────────────────────────────────────

  function renderTrackedChatsList(chat) {
    const entries = Object.values(trackedChats)
      .filter((entry) => entry.enabled)
      .sort((left, right) => (right.lastSync || 0) - (left.lastSync || 0));

    if (!entries.length) return "";

    return `
      <div class="pipa-section">
        <label class="pipa-label">CHATS MONITORADOS (${entries.length})</label>
        <div class="pipa-tracked-list">
          ${entries
            .map((entry) => {
              const isCurrent = chat?.chatKey === entry.chatKey;
              const meta = [
                `${entry.msgCount || 0} msgs`,
                entry.companyName || "sem conta",
                timeAgo(entry.lastSync),
              ]
                .filter(Boolean)
                .join(" · ");
              return `
                <div class="pipa-tracked-item ${isCurrent ? "current" : ""}">
                  <div class="pipa-tracked-dot-icon"></div>
                  <div class="pipa-tracked-info">
                    <span class="pipa-tracked-name">${escapeHtml(entry.displayName || "Chat")}</span>
                    <span class="pipa-tracked-meta">${escapeHtml(meta)}</span>
                  </div>
                  <button class="pipa-tracked-remove" data-chat-key="${escapeHtml(entry.chatKey)}" title="Parar">${ICONS.trash}</button>
                </div>
              `;
            })
            .join("")}
        </div>
      </div>
    `;
  }

  function renderCompanyResults() {
    if (!monitorState.companyResults.length) return "";
    return `
      <div class="pipa-search-results">
        ${monitorState.companyResults
          .map(
            (company) => `
              <button class="pipa-result-item" data-company-id="${company.id}">
                <span class="pipa-result-title">${escapeHtml(company.name)}</span>
                <span class="pipa-result-sub">${escapeHtml(
                  [
                    company.buying_signal ? `signal ${company.buying_signal}` : null,
                    company.cadence_day ? `D${company.cadence_day}` : null,
                    company.cadence_status || null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                )}</span>
              </button>
            `
          )
          .join("")}
      </div>
    `;
  }

  function renderContactResults() {
    if (!monitorState.contactResults.length) return "";
    return `
      <div class="pipa-search-results">
        ${monitorState.contactResults
          .map(
            (contact) => `
              <button class="pipa-result-item" data-contact-id="${contact.id}">
                <span class="pipa-result-title">${escapeHtml(contact.name)}</span>
                <span class="pipa-result-sub">${escapeHtml(
                  [contact.role || "sem cargo", contact.whatsapp || contact.email || null]
                    .filter(Boolean)
                    .join(" · ")
                )}</span>
              </button>
            `
          )
          .join("")}
      </div>
    `;
  }

  function renderSelectedCompany() {
    if (!monitorState.selectedCompany) return "";
    const company = monitorState.selectedCompany;
    return `
      <div class="pipa-selection-card">
        <div class="pipa-selection-main">
          <span class="pipa-selection-icon">${ICONS.building}</span>
          <div>
            <p class="pipa-selection-title">${escapeHtml(company.name)}</p>
            <p class="pipa-selection-sub">${escapeHtml(
              [
                company.buying_signal ? `signal ${company.buying_signal}` : null,
                company.cadence_day ? `D${company.cadence_day}` : null,
                company.cadence_status || null,
              ]
                .filter(Boolean)
                .join(" · ") || "Conta selecionada"
            )}</p>
          </div>
        </div>
        <button class="pipa-chip-btn" id="pipa-clear-company">Trocar</button>
      </div>
    `;
  }

  function renderSelectedContact(chat) {
    if (!monitorState.selectedContact) {
      return `
        <div class="pipa-selection-card ghost">
          <div class="pipa-selection-main">
            <span class="pipa-selection-icon">${ICONS.contact}</span>
            <div>
              <p class="pipa-selection-title">${escapeHtml(chat?.displayName || "Sem contato")}</p>
              <p class="pipa-selection-sub">Se nao escolher um contato do CRM, o chat sera ligado so a conta.</p>
            </div>
          </div>
        </div>
      `;
    }

    const contact = monitorState.selectedContact;
    return `
      <div class="pipa-selection-card">
        <div class="pipa-selection-main">
          <span class="pipa-selection-icon">${ICONS.contact}</span>
          <div>
            <p class="pipa-selection-title">${escapeHtml(contact.name)}</p>
            <p class="pipa-selection-sub">${escapeHtml(
              [contact.role || "sem cargo", contact.whatsapp || contact.email || null]
                .filter(Boolean)
                .join(" · ")
            )}</p>
          </div>
        </div>
        <button class="pipa-chip-btn" id="pipa-clear-contact">Limpar</button>
      </div>
    `;
  }

  function bindMonitorPanel(container, chat, tracked) {
    bindPanelClose();

    // Company search
    container.querySelector("#pipa-company-search")?.addEventListener("input", (event) => {
      monitorState.companyQuery = event.target.value;
    });
    container.querySelector("#pipa-company-search")?.addEventListener("keydown", async (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        await searchCompaniesInCRM(monitorState.companyQuery);
      }
    });
    container.querySelector("#pipa-company-search-btn")?.addEventListener("click", async () => {
      await searchCompaniesInCRM(monitorState.companyQuery);
    });
    container.querySelectorAll("[data-company-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        const company = monitorState.companyResults.find((item) => item.id === button.dataset.companyId);
        if (!company) return;
        monitorState.selectedCompany = company;
        monitorState.companyQuery = company.name;
        monitorState.companyResults = [];
        setMonitorBanner("", "");
        rerenderMonitor();
      });
    });
    container.querySelector("#pipa-clear-company")?.addEventListener("click", () => {
      monitorState.selectedCompany = null;
      monitorState.companyQuery = "";
      monitorState.companyResults = [];
      rerenderMonitor();
    });

    // Suggestion selection (ambiguous match)
    container.querySelectorAll("[data-suggestion-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const match = monitorState.autoMatch;
        const contact = (match?.suggestions || []).find((item) => item.id === button.dataset.suggestionId);
        if (!contact) return;
        monitorState.autoMatch = { found: true, contact, match_type: "selected" };
        monitorState.selectedContact = contact;
        monitorState.selectedCompany = contact.companies || null;
        setMonitorBanner("", "");
        rerenderMonitor();
      });
    });

    // Register mode toggle
    container.querySelector("#pipa-show-register")?.addEventListener("click", () => {
      monitorState.registerMode = true;
      rerenderMonitor();
    });

    // Quick register
    container.querySelector("#pipa-register-btn")?.addEventListener("click", async () => {
      if (!monitorState.selectedCompany?.id) {
        setMonitorBanner("error", "Selecione uma empresa primeiro.");
        rerenderMonitor();
        return;
      }
      setMonitorBusy(true, "Cadastrando contato...");
      rerenderMonitor();
      const res = await msg("CREATE_CONTACT", {
        companyId: monitorState.selectedCompany.id,
        name: chat?.displayName || "",
        phone: chat?.phoneNumber || "",
      });
      setMonitorBusy(false);
      if (!res.ok || !res.data) {
        setMonitorBanner("error", res.error || "Falha ao cadastrar contato.");
        rerenderMonitor();
        return;
      }
      monitorState.selectedContact = res.data;
      monitorState.autoMatch = { found: true, contact: { ...res.data, companies: monitorState.selectedCompany }, match_type: "created" };
      monitorState.registerMode = false;
      setMonitorBanner("success", `${res.data.name} cadastrado no CRM!`);
      rerenderMonitor();
    });

    // Connect and pull 
    container.querySelector("#pipa-link-start")?.addEventListener("click", async () => {
      await linkAndStartTracking();
    });

    // Remove tracked
    container.querySelectorAll(".pipa-tracked-remove").forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.stopPropagation();
        await stopTracking(button.dataset.chatKey);
      });
    });
  }

  function renderMonitorPanel(container) {
    const chat = getCurrentChatContext();
    currentChat = chat;
    const tracked = chat ? getTrackedEntry(chat.chatKey) : null;
    const match = monitorState.autoMatch;

    const bannerHtml = monitorState.bannerText
      ? `<div class="pipa-banner ${monitorState.bannerTone || "info"}">${escapeHtml(monitorState.bannerText)}</div>`
      : "";

    const busyHtml = monitorState.busy
      ? `
        <div class="pipa-capture-status on">
          <div class="pipa-spinner" style="width:16px;height:16px;border-width:2px"></div>
          <div>
            <p class="pipa-capture-status-label">Sincronizando</p>
            <p class="pipa-capture-meta">${escapeHtml(monitorState.busyText || "Puxando conversa...")}</p>
          </div>
        </div>
      `
      : "";

    // Auto-match section
    let matchSectionHtml = "";
    if (monitorState.autoMatchLoading) {
      matchSectionHtml = `
        <div class="pipa-section">
          <div class="pipa-match-loading">
            <div class="pipa-spinner" style="width:16px;height:16px;border-width:2px"></div>
            <span>Buscando no CRM...</span>
          </div>
        </div>
      `;
    } else if (match?.found && match.contact) {
      const contact = match.contact;
      const company = contact.companies;
      matchSectionHtml = `
        <div class="pipa-section">
          <div class="pipa-match-card found">
            <div class="pipa-match-dot green"></div>
            <div class="pipa-match-info">
              <p class="pipa-match-name">${escapeHtml(contact.name)}</p>
              <p class="pipa-match-company">${escapeHtml(company?.name || "Sem empresa")}${contact.role ? ` · ${escapeHtml(contact.role)}` : ""}</p>
            </div>
          </div>
          ${tracked ? `
            <div class="pipa-capture-status on">
              <span class="pipa-capture-pulse"></span>
              <div>
                <p class="pipa-capture-status-label">${escapeHtml(`${tracked.msgCount || 0} msgs capturadas`)}</p>
                <p class="pipa-capture-meta">${escapeHtml(`Ultimo sync ${timeAgo(tracked.lastSync)}`)}</p>
              </div>
            </div>
          ` : ""}
          <div class="pipa-action-stack">
            <button class="pipa-btn pipa-btn-primary" id="pipa-link-start" style="padding:12px;font-size:13px" ${monitorState.busy ? "disabled" : ""}>
              ${ICONS.refresh} ${tracked ? "Re-sincronizar" : "Conectar e Puxar"}
            </button>
          </div>
        </div>
      `;
    } else if (match?.match_type === "ambiguous" && match.suggestions?.length) {
      matchSectionHtml = `
        <div class="pipa-section">
          <div class="pipa-match-card warn">
            <div class="pipa-match-dot yellow"></div>
            <div class="pipa-match-info">
              <p class="pipa-match-name">Múltiplos contatos encontrados</p>
              <p class="pipa-match-company">Selecione o correto:</p>
            </div>
          </div>
          <div class="pipa-search-results">
            ${match.suggestions.map((s) => `
              <button class="pipa-result-item" data-suggestion-id="${s.id}">
                <span class="pipa-result-title">${escapeHtml(s.name)}</span>
                <span class="pipa-result-sub">${escapeHtml([s.companies?.name, s.role, s.whatsapp].filter(Boolean).join(" · "))}</span>
              </button>
            `).join("")}
          </div>
        </div>
      `;
    } else if (match?.match_type === "none" || (match && !match.found)) {
      // Not found — show register mode
      if (monitorState.registerMode) {
        matchSectionHtml = `
          <div class="pipa-section">
            <div class="pipa-match-card warn">
              <div class="pipa-match-dot yellow"></div>
              <div class="pipa-match-info">
                <p class="pipa-match-name">Cadastrar ${escapeHtml(chat?.displayName || "contato")}</p>
                <p class="pipa-match-company">Selecione a empresa e clique em cadastrar</p>
              </div>
            </div>
            <div class="pipa-search-row">
              <input class="pipa-input" id="pipa-company-search" placeholder="Buscar empresa..." value="${escapeHtml(monitorState.companyQuery)}">
              <button class="pipa-btn pipa-btn-secondary" id="pipa-company-search-btn" ${monitorState.busy ? "disabled" : ""}>
                ${ICONS.search}
              </button>
            </div>
            ${renderSelectedCompany()}
            ${monitorState.companyLoading ? `<div class="pipa-loading-inline">Buscando...</div>` : ""}
            ${renderCompanyResults()}
            <div class="pipa-action-stack">
              <button class="pipa-btn pipa-btn-primary" id="pipa-register-btn" style="padding:12px;font-size:13px" ${monitorState.busy || !monitorState.selectedCompany ? "disabled" : ""}>
                ${ICONS.contact} Cadastrar e Conectar
              </button>
            </div>
          </div>
        `;
      } else {
        matchSectionHtml = `
          <div class="pipa-section">
            <div class="pipa-match-card notfound">
              <div class="pipa-match-dot red"></div>
              <div class="pipa-match-info">
                <p class="pipa-match-name">Contato não está no CRM</p>
                <p class="pipa-match-company">${escapeHtml(chat?.displayName || "")} não foi encontrado</p>
              </div>
            </div>
            <div class="pipa-action-stack">
              <button class="pipa-btn pipa-btn-primary" id="pipa-show-register" style="padding:12px;font-size:13px">
                ${ICONS.contact} Cadastrar no CRM
              </button>
            </div>
          </div>
        `;
      }
    }

    container.innerHTML = `
      ${panelHeader("Pipa", "WhatsApp → CRM")}
      <div class="pipa-panel-body">
        ${chat ? `
          <div class="pipa-section">
            <div class="pipa-monitor-card">
              <div class="pipa-monitor-avatar">${escapeHtml(chat.displayName.charAt(0).toUpperCase())}</div>
              <div class="pipa-monitor-info">
                <p class="pipa-monitor-name">${escapeHtml(chat.displayName)}</p>
                <p class="pipa-monitor-sub">${escapeHtml(chat.phoneNumber ? chat.phoneNumber : "WhatsApp Web")}</p>
              </div>
            </div>
            ${bannerHtml}
            ${busyHtml}
          </div>
          ${matchSectionHtml}
        ` : `
          <div class="pipa-section">
            <div class="pipa-info-box">
              <span class="pipa-info-icon">${ICONS.monitor}</span>
              <div>
                <p class="pipa-info-title">Abra um chat</p>
                <p class="pipa-info-desc">Selecione uma conversa no WhatsApp para conectar ao CRM.</p>
              </div>
            </div>
          </div>
        `}
        ${renderTrackedChatsList(chat)}
      </div>
    `;

    bindMonitorPanel(container, chat, tracked);
  }

  // ── Auto-Match ─────────────────────────────────────────

  async function triggerAutoMatch(chat) {
    if (!chat) return;
    const requestedChatKey = chat.chatKey;
    monitorState.autoMatchLoading = true;
    monitorState.autoMatch = null;
    monitorState.registerMode = false;
    rerenderMonitor();

    try {
      const res = await msg("MATCH_CONTACT", {
        phone: chat.phoneNumber || "",
        name: chat.displayName || "",
      });
      if (currentChat?.chatKey !== requestedChatKey) return;
      if (res.ok && res.data) {
        monitorState.autoMatch = res.data;
        if (res.data.found && res.data.contact) {
          monitorState.selectedContact = res.data.contact;
          monitorState.selectedCompany = res.data.contact.companies || null;
        }
      } else {
        monitorState.autoMatch = { found: false, suggestions: [], match_type: "none" };
      }
    } catch (e) {
      if (currentChat?.chatKey !== requestedChatKey) return;
      console.warn("[Pipa] Auto-match failed:", e);
      monitorState.autoMatch = { found: false, suggestions: [], match_type: "error" };
    }

    if (currentChat?.chatKey !== requestedChatKey) return;
    monitorState.autoMatchLoading = false;
    rerenderMonitor();
  }

  // ── Tracking System ────────────────────────────────────

  async function searchCompaniesInCRM(query) {
    const term = String(query || "").trim();
    if (!term) {
      setMonitorBanner("error", "Digite pelo menos parte do nome da conta.");
      monitorState.companyResults = [];
      rerenderMonitor();
      return;
    }

    monitorState.companyLoading = true;
    setMonitorBusy(true, "Buscando contas no CRM...");
    setMonitorBanner("", "");
    rerenderMonitor();

    const res = await msg("SEARCH_COMPANIES", { query: term });
    monitorState.companyLoading = false;
    setMonitorBusy(false);

    if (!res.ok) {
      setMonitorBanner("error", res.error || "Nao foi possivel buscar contas.");
      rerenderMonitor();
      return;
    }

    monitorState.companyResults = res.data || [];
    if (!monitorState.companyResults.length) {
      setMonitorBanner("info", "Nenhuma conta encontrada com esse termo.");
    }
    rerenderMonitor();
  }

  async function loadContactsForCompany(companyId, query = "") {
    if (!companyId) return;

    monitorState.contactLoading = true;
    setMonitorBusy(true, "Carregando contatos da conta...");
    setMonitorBanner("", "");
    rerenderMonitor();

    const res = await msg("SEARCH_CONTACTS", { companyId, query });
    monitorState.contactLoading = false;
    setMonitorBusy(false);

    if (!res.ok) {
      setMonitorBanner("error", res.error || "Nao foi possivel carregar os contatos.");
      rerenderMonitor();
      return;
    }

    monitorState.contactResults = res.data || [];
    if (!monitorState.contactResults.length) {
      setMonitorBanner("info", "Nenhum contato encontrado nessa conta.");
    }
    rerenderMonitor();
  }

  function buildTrackedEntry(chat) {
    const selectedCompany = monitorState.selectedCompany;
    const selectedContact = monitorState.selectedContact;
    const currentEntry = trackedChats[chat.chatKey] || {};

    return {
      chatKey: chat.chatKey,
      displayName: chat.displayName,
      phoneNumber: chat.phoneNumber || selectedContact?.whatsapp || null,
      enabled: true,
      lastSync: Date.now(),
      msgCount: currentEntry.msgCount || 0,
      companyId: selectedCompany?.id || null,
      companyName: selectedCompany?.name || null,
      buyingSignal: selectedCompany?.buying_signal || null,
      cadenceDay: selectedCompany?.cadence_day || null,
      cadenceStatus: selectedCompany?.cadence_status || null,
      contactId: selectedContact?.id || null,
      contactName: selectedContact?.name || chat.displayName,
      contactRole: selectedContact?.role || null,
      contactEmail: selectedContact?.email || null,
      personaType: derivePersonaType(selectedContact),
      lastFingerprint: currentEntry.lastFingerprint || null,
      lastTailFingerprint: currentEntry.lastTailFingerprint || null,
      lastRawText: currentEntry.lastRawText || null,
    };
  }

  function buildConversationPayload(chat, trackedEntry) {
    return {
      company_id: trackedEntry?.companyId || null,
      company_name: trackedEntry?.companyName || null,
      contact_id: trackedEntry?.contactId || null,
      contact_name: trackedEntry?.contactName || chat.displayName || "Contato",
      display_name: chat.displayName || null,
      chat_display_name: chat.displayName || null,
      phone_number: trackedEntry?.phoneNumber || chat.phoneNumber || null,
      persona_type: trackedEntry?.personaType || "dir_comercial",
      cadence_day: trackedEntry?.cadenceDay || null,
      chat_key: chat.chatKey,
      key_source: chat.keySource || null,
      bridge_connected: Boolean(chat.bridgeConnected),
    };
  }

  function cssAttrValue(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function findComposerBox() {
    return document.querySelector("#main footer div[contenteditable='true']");
  }

  function getComposerText() {
    const box = findComposerBox();
    return normalizeExtractedText(box?.innerText || box?.textContent || "");
  }

  function isManualTypingActive() {
    const box = findComposerBox();
    if (!box) return false;
    return Boolean(box.contains(document.activeElement) || document.activeElement === box || getComposerText());
  }

  async function waitForComposer(timeoutMs = 8000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const box = findComposerBox();
      if (box) return box;
      await sleep(200);
    }
    return null;
  }

  async function openChatInPaneForSend({ chatKey, phoneNumber, contactName }) {
    const current = getCurrentChatContext();
    const normalizedPhone = normalizePhone(phoneNumber);
    if (
      current &&
      (
        (chatKey && current.chatKey === chatKey) ||
        (normalizedPhone && normalizePhone(current.phoneNumber) === normalizedPhone) ||
        (contactName && current.displayName === contactName)
      )
    ) {
      return true;
    }

    const lookupValues = [
      chatKey,
      chatKey ? chatKey.replace(/^wa:/, "") : null,
      normalizedPhone,
      contactName,
    ].filter(Boolean);

    for (const value of lookupValues) {
      const safe = cssAttrValue(value);
      const selectors = [
        `#pane-side [data-id*="${safe}"]`,
        `#pane-side [title="${safe}"]`,
        `#pane-side [aria-label*="${safe}"]`,
      ];

      for (const selector of selectors) {
        const item = document.querySelector(selector);
        if (!item) continue;
        const clickable = item.closest("[role='listitem']") || item;
        clickable.click();
        for (let attempt = 0; attempt < 24; attempt += 1) {
          await sleep(150);
          const next = getCurrentChatContext();
          if (
            next &&
            (
              (chatKey && next.chatKey === chatKey) ||
              (normalizedPhone && normalizePhone(next.phoneNumber) === normalizedPhone) ||
              (contactName && next.displayName === contactName)
            )
          ) {
            return true;
          }
        }
      }
    }

    if (normalizedPhone) {
      window.location.assign(`https://web.whatsapp.com/send?phone=${encodeURIComponent(normalizedPhone)}`);
      const box = await waitForComposer(12000);
      return Boolean(box);
    }

    return false;
  }

  async function sendMessageToChat({ chatKey, phoneNumber, contactName, message }) {
    if (!message?.trim()) throw new Error("Mensagem vazia.");
    if (isManualTypingActive()) throw new Error("manual_input_active");

    const opened = await openChatInPaneForSend({ chatKey, phoneNumber, contactName });
    if (!opened) throw new Error(`Chat ${chatKey || phoneNumber || contactName || ""} nao encontrado.`);

    const box = await waitForComposer();
    if (!box) throw new Error("Input do WhatsApp nao encontrado.");
    if (isManualTypingActive()) throw new Error("manual_input_active");

    box.focus();
    document.execCommand("insertText", false, message);
    await sleep(250);

    const sendButton =
      document.querySelector("#main footer button[aria-label*='Enviar' i]") ||
      document.querySelector("#main footer [data-icon='send']")?.closest("button") ||
      document.querySelector("#main footer [data-testid='send']")?.closest("button");
    if (!sendButton) throw new Error("Botao enviar nao encontrado.");

    sendButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await sleep(800);
    await requestWaBridge("FORCE_REFRESH", {}, 800).catch(() => null);
    return `pending-capture:${Date.now()}`;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "PIPA_SEND_WHATSAPP_MESSAGE" && message?.type !== "SEND_REQUEST") return false;
    const payload = message.payload || {};
    sendMessageToChat({
      chatKey: payload.chatKey || payload.chat_id,
      phoneNumber: payload.phoneNumber || payload.phone,
      contactName: payload.contactName,
      message: payload.message || payload.content_wa,
    })
      .then((rawId) => sendResponse({ ok: true, raw_id: rawId }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  });

  function splitSnapshotLines(rawText) {
    return String(rawText || "")
      .split("\n")
      .map((line) => normalizeExtractedText(line))
      .filter(Boolean);
  }

  function buildSnapshotFromLines(chatKey, lines, baseSnapshot = {}) {
    const normalizedLines = lines
      .map((line) => normalizeExtractedText(line))
      .filter(Boolean);
    const lineFingerprints = normalizedLines.map((line) => createLineFingerprint(line));
    return {
      ...baseSnapshot,
      lines: normalizedLines,
      rawText: normalizedLines.join("\n"),
      lineCount: normalizedLines.length,
      lineFingerprints,
      fingerprint: createSnapshotFingerprint(chatKey, lineFingerprints),
      tailFingerprint: createSnapshotFingerprint(chatKey, lineFingerprints.slice(-8)),
    };
  }

  function mergeSnapshotWithStoredHistory(chatKey, trackedEntry, snapshot) {
    const storedLines = splitSnapshotLines(trackedEntry?.lastRawText);
    if (!storedLines.length || !snapshot?.lines?.length) {
      return snapshot;
    }

    const currentLines = snapshot.lines;
    const storedFingerprints = storedLines.map((line) => createLineFingerprint(line));
    const currentFingerprints = snapshot.lineFingerprints?.length
      ? snapshot.lineFingerprints
      : currentLines.map((line) => createLineFingerprint(line));

    let overlap = 0;
    const maxOverlap = Math.min(storedFingerprints.length, currentFingerprints.length);
    for (let size = maxOverlap; size > 0; size -= 1) {
      const storedSlice = storedFingerprints.slice(storedFingerprints.length - size).join("|");
      const currentSlice = currentFingerprints.slice(0, size).join("|");
      if (storedSlice === currentSlice) {
        overlap = size;
        break;
      }
    }

    if (!overlap) {
      if (snapshot.lineCount >= storedLines.length) {
        return snapshot;
      }
      return null;
    }

    if (overlap === currentLines.length && storedLines.length >= currentLines.length) {
      return buildSnapshotFromLines(chatKey, storedLines, {
        merged: true,
      });
    }

    const mergedLines = storedLines.concat(currentLines.slice(overlap));
    return buildSnapshotFromLines(chatKey, mergedLines, {
      merged: true,
    });
  }

  async function syncCurrentConversation({
    retroactive = true,
    quiet = false,
    snapshot = null,
  } = {}) {
    const chat = getCurrentChatContext();
    currentChat = chat;
    if (!chat) {
      setMonitorBanner("error", "Abra uma conversa no WhatsApp antes de sincronizar.");
      rerenderMonitor();
      return null;
    }

    const trackedEntry = getTrackedEntry(chat.chatKey) || buildTrackedEntry(chat);
    if (!trackedEntry.companyId) {
      setMonitorBanner("info", "Capturando sem vinculo com CRM. Vincule depois para organizar por empresa.");
    }

    if (!quiet) {
      setMonitorBusy(
        true,
        retroactive ? "Carregando historico completo do chat..." : "Sincronizando novas mensagens..."
      );
      setMonitorBanner("", "");
      rerenderMonitor();
    }

    try {
      if (retroactive) {
        await loadAllMessages((progress) => {
          if (!quiet) {
            setMonitorBusy(
              true,
              `Buscando historico do chat... ${progress.round} · ${progress.currentCount} msgs`
            );
            rerenderMonitor();
          }
        });
      }

      await requestWaBridge("GET_CONVERSATION_SNAPSHOT", {}, 800).catch(() => null);

      let conversationSnapshot = snapshot || createConversationSnapshot(chat);
      if (!retroactive) {
        const mergedSnapshot = mergeSnapshotWithStoredHistory(
          chat.chatKey,
          trackedEntry,
          conversationSnapshot
        );
        if (!mergedSnapshot && trackedEntry?.msgCount > conversationSnapshot.lineCount) {
          throw new Error("Historico parcial no DOM. Rode o sync retroativo para reidratar o chat.");
        }
        if (mergedSnapshot) {
          conversationSnapshot = mergedSnapshot;
        }
      }

      if (!conversationSnapshot.rawText.trim()) {
        throw new Error("Nenhuma mensagem encontrada nesta conversa.");
      }

      if (!quiet) {
        setMonitorBusy(true, `Salvando ${conversationSnapshot.lineCount} mensagens no CRM...`);
        rerenderMonitor();
      }

      const res = await msg("SAVE_CONVERSATION", {
        payload: {
          ...buildConversationPayload(chat, trackedEntry),
          raw_text: conversationSnapshot.rawText,
          message_count: conversationSnapshot.lineCount,
          messages: conversationSnapshot.messages.map((message) => ({
            sender: message.sender,
            sender_name: message.sender_name || message.sender,
            direction: message.direction,
            body: message.body || message.line,
            raw_source: message.raw_source || message.line,
            source: message.source || message.line,
            stamp: message.stamp || message.timeLabel || "",
            message_type: message.messageType || "text",
            external_id: message.external_id || null,
            message_fingerprint_source: message.message_fingerprint_source || message.external_id || message.line,
            media: Array.isArray(message.media) ? message.media : [],
          })),
        },
      });

      if (!res.ok) {
        throw new Error(res.error || "Falha ao salvar conversa.");
      }

      lastMsgCount = conversationSnapshot.lineCount;
      trackedChats[chat.chatKey] = {
        ...trackedEntry,
        lastSync: Date.now(),
        msgCount: conversationSnapshot.lineCount,
        lastFingerprint: conversationSnapshot.fingerprint,
        lastTailFingerprint: conversationSnapshot.tailFingerprint,
        lastRawText: conversationSnapshot.rawText,
      };
      await saveTrackedChats();
      updateMonitorDot();

      if (!quiet) {
        setMonitorBusy(false);
        setMonitorBanner(
          "success",
          res.data?.duplicate
            ? "O CRM ja tinha essa versao do chat. Monitoramento mantido."
            : `${conversationSnapshot.lineCount} mensagens sincronizadas com sucesso.`
        );
        rerenderMonitor();
      }

      return {
        lineCount: conversationSnapshot.lineCount,
        duplicate: Boolean(res.data?.duplicate),
        fingerprint: conversationSnapshot.fingerprint,
        tailFingerprint: conversationSnapshot.tailFingerprint,
        rawText: conversationSnapshot.rawText,
      };
    } catch (error) {
      if (!quiet) {
        setMonitorBusy(false);
        setMonitorBanner("error", error.message || "Falha ao sincronizar a conversa.");
        rerenderMonitor();
      } else {
        console.warn("[Pipa] Fast sync failed:", error);
      }
      return null;
    }
  }

  async function linkAndStartTracking() {
    const chat = getCurrentChatContext();
    currentChat = chat;
    if (!chat) {
      setMonitorBanner("error", "Abra um chat no WhatsApp para continuar.");
      rerenderMonitor();
      return;
    }

    if (!monitorState.selectedContact?.id && !monitorState.autoMatch?.found) {
      setMonitorBanner("error", "Cadastre o contato no CRM antes de capturar.");
      rerenderMonitor();
      return;
    }

    // Use auto-matched contact if available
    if (monitorState.autoMatch?.found && monitorState.autoMatch.contact) {
      const mc = monitorState.autoMatch.contact;
      monitorState.selectedContact = mc;
      monitorState.selectedCompany = mc.companies || monitorState.selectedCompany;
    }

    const previous = trackedChats[chat.chatKey] ? { ...trackedChats[chat.chatKey] } : null;
    const nextEntry = buildTrackedEntry(chat);
    trackedChats[chat.chatKey] = nextEntry;
    await saveTrackedChats();
    updateMonitorDot();

    const result = await syncCurrentConversation({ retroactive: true });
    if (!result) {
      if (previous) trackedChats[chat.chatKey] = previous;
      else delete trackedChats[chat.chatKey];
      await saveTrackedChats();
      updateMonitorDot();
      return;
    }

    trackedChats[chat.chatKey] = {
      ...nextEntry,
      lastSync: Date.now(),
      msgCount: result.lineCount,
      lastFingerprint: result.fingerprint,
      lastTailFingerprint: result.tailFingerprint,
      lastRawText: result.rawText,
    };
    await saveTrackedChats();
    startAutoCapture(chat.chatKey);
    rerenderMonitor();
  }

  async function stopTracking(chatKey) {
    if (!chatKey) return;

    const isCurrentChat = currentChat?.chatKey === chatKey;
    if (isCurrentChat) {
      const snapshot = createConversationSnapshot(currentChat);
      if (snapshot.rawText.trim() && snapshot.lineCount >= lastMsgCount) {
        await syncCurrentConversation({ retroactive: false });
      }
      stopAutoCapture();
    }

    delete trackedChats[chatKey];
    await saveTrackedChats();
    updateMonitorDot();
    hydrateMonitorStateFromCurrentChat();
    setMonitorBanner("info", "Monitoramento interrompido para este chat.");
    rerenderMonitor();
  }

  function stopMessageObserver() {
    if (messageObserver) {
      messageObserver.disconnect();
      messageObserver = null;
    }
    messageObserverChatKey = null;
    observedMessageContainer = null;
  }

  async function runFastSync(chatKey) {
    if (syncInFlightChatKey === chatKey) {
      queuedSyncChatKey = chatKey;
      return;
    }

    const chat = getCurrentChatContext();
    currentChat = chat;
    if (!chat || chat.chatKey !== chatKey) return;

    const trackedEntry = getTrackedEntry(chatKey);
    if (!trackedEntry?.enabled) return;

    syncInFlightChatKey = chatKey;
    try {
      const snapshot = createConversationSnapshot(chat);
      if (!snapshot.rawText.trim()) return;
      const mergedSnapshot =
        trackedEntry.msgCount > snapshot.lineCount
          ? mergeSnapshotWithStoredHistory(chatKey, trackedEntry, snapshot)
          : snapshot;
      if (!mergedSnapshot) {
        if (activePanel === "monitor" && currentChat?.chatKey === chatKey && !monitorState.busy) {
          setMonitorBanner("info", "Historico parcial carregado. Rode o sync retroativo para reidratar o chat.");
          rerenderMonitor();
        }
        return;
      }
      if (
        trackedEntry.lastTailFingerprint &&
        mergedSnapshot.tailFingerprint === trackedEntry.lastTailFingerprint &&
        mergedSnapshot.lineCount <= (trackedEntry.msgCount || 0)
      ) {
        return;
      }
      if (mergedSnapshot.fingerprint === trackedEntry.lastFingerprint) return;

      const result = await syncCurrentConversation({
        retroactive: false,
        quiet: true,
        snapshot: mergedSnapshot,
      });

      if (result) {
        trackedChats[chatKey] = {
          ...trackedEntry,
          lastSync: Date.now(),
          msgCount: result.lineCount,
          lastFingerprint: result.fingerprint,
          lastTailFingerprint: result.tailFingerprint,
          lastRawText: result.rawText,
        };
        await saveTrackedChats();
        lastMsgCount = result.lineCount;
        if (activePanel === "monitor") {
          rerenderMonitor();
        }
      }
    } finally {
      syncInFlightChatKey = null;
      if (queuedSyncChatKey === chatKey) {
        queuedSyncChatKey = null;
        scheduleRealtimeSync(chatKey, 250);
      }
    }
  }

  function scheduleRealtimeSync(chatKey, delay = 850) {
    clearTimeout(realtimeSyncTimer);
    realtimeSyncTimer = setTimeout(() => {
      runFastSync(chatKey);
    }, delay);
  }

  function startMessageObserver(chatKey) {
    stopMessageObserver();

    const attachObserver = () => {
      const container = getMessageContainer();
      if (!container) {
        setTimeout(() => {
          if (currentChat?.chatKey === chatKey) {
            attachObserver();
          }
        }, 400);
        return;
      }

      observedMessageContainer = container;
      messageObserverChatKey = chatKey;
      messageObserver = new MutationObserver((mutations) => {
        const shouldSync = mutations.some((mutation) => {
          if (mutation.type === "characterData") return true;
          if (mutation.type !== "childList") return false;
          return Array.from(mutation.addedNodes).some((node) => {
            if (node.nodeType !== Node.ELEMENT_NODE) return false;
            const element = node;
            return (
              element.matches?.("[data-pre-plain-text], [data-testid='msg-container'], .message-in, .message-out") ||
              element.querySelector?.("[data-pre-plain-text], [data-testid='msg-container'], .message-in, .message-out")
            );
          });
        });

        if (shouldSync) {
          scheduleRealtimeSync(chatKey);
        }
      });

      messageObserver.observe(container, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    };

    attachObserver();
  }

  function startAutoCapture(chatKey) {
    // DESATIVADO — captura via DOM scraping foi substituída por captura
    // on-click usando wa-js (botão "Capturar conversa" no sidebar).
    // O DOM scraping produzia bugs de formatação (ex: "ola17:19") e
    // duplicatas. Mantém a função como no-op pra não quebrar chamadas
    // existentes no fluxo do sidebar/monitor.
    stopAutoCapture();
    return;
  }

  function stopAutoCapture() {
    if (autoCaptureTimer) {
      clearInterval(autoCaptureTimer);
      autoCaptureTimer = null;
    }
    clearTimeout(realtimeSyncTimer);
    realtimeSyncTimer = null;
    queuedSyncChatKey = null;
    stopMessageObserver();
  }

  // ── Conversation Watcher ───────────────────────────────

  function setupConversationWatcher() {
    if (watcherStarted) return;
    watcherStarted = true;

    const observer = new MutationObserver(() => {
      clearTimeout(watchDebounce);
      watchDebounce = setTimeout(() => {
        const nextChat = getCurrentChatContext();
        if (nextChat?.chatKey !== currentChat?.chatKey) {
          onConversationSwitch(nextChat);
        }
      }, 500);
    });

    const appEl = document.querySelector("#app") || document.body;
    observer.observe(appEl, { childList: true, subtree: true });

    conversationGuardTimer = setInterval(() => {
      const nextChat = getCurrentChatContext();
      if (nextChat?.chatKey !== currentChat?.chatKey) {
        onConversationSwitch(nextChat);
      }
    }, 1500);
  }

  async function onConversationSwitch(chat) {
    stopAutoCapture();
    currentChat = chat;
    monitorState.autoMatch = null;
    monitorState.autoMatchLoading = false;
    monitorState.registerMode = false;
    hydrateMonitorStateFromCurrentChat();

    const trackedEntry = chat ? getTrackedEntry(chat.chatKey) : null;
    if (trackedEntry?.enabled) {
      const snapshot = createConversationSnapshot(chat);
      lastMsgCount = Math.max(snapshot.lineCount, trackedEntry.msgCount || 0);
      if (!trackedEntry.lastFingerprint && snapshot.rawText.trim()) {
        trackedChats[chat.chatKey] = {
          ...trackedEntry,
          lastFingerprint: snapshot.fingerprint,
          lastTailFingerprint: snapshot.tailFingerprint,
          lastRawText: snapshot.rawText,
          msgCount: snapshot.lineCount,
        };
        await saveTrackedChats();
      }
      startAutoCapture(chat.chatKey);
    } else {
      lastMsgCount = 0;
    }

    updateMonitorDot();
    rerenderMonitor();

    // Auto-match or show tracked state
    if (chat && trackedEntry?.enabled) {
      monitorState.autoMatch = {
        found: true,
        contact: {
          id: trackedEntry.contactId,
          name: trackedEntry.contactName || chat.displayName,
          role: trackedEntry.contactRole,
          whatsapp: trackedEntry.phoneNumber,
          companies: trackedEntry.companyId ? {
            id: trackedEntry.companyId,
            name: trackedEntry.companyName,
          } : null,
        },
        match_type: "tracked",
      };
      rerenderMonitor();
    } else if (chat) {
      await triggerAutoMatch(chat);
    }
  }

  // ── Tasks Panel ────────────────────────────────────────

  async function renderTasksPanel(container) {
    container.innerHTML = `
      ${panelHeader("Tarefas do Dia", new Date().toLocaleDateString("pt-BR"))}
      <div class="pipa-panel-body">
        <div class="pipa-loading"><div class="pipa-spinner"></div><p>Carregando tarefas...</p></div>
      </div>
    `;
    bindPanelClose();

    const res = await msg("GET_TASKS");

    if (!res.ok) {
      container.querySelector(".pipa-panel-body").innerHTML = `
        <div class="pipa-section">
          <p class="pipa-no-results">Erro ao carregar tarefas</p>
          <p class="pipa-error">${escapeHtml(res.error || "")}</p>
        </div>
      `;
      return;
    }

    const tasks = res.data || [];
    renderTaskList(container, tasks);
  }

  function renderTaskList(container, tasks) {
    const taskTypeLabels = {
      send_whatsapp: "WhatsApp",
      send_linkedin: "LinkedIn",
      make_call: "Ligar",
      send_email: "E-mail",
      followup: "Follow-up",
    };

    const taskTypeIcons = {
      send_whatsapp: ICONS.send,
      send_linkedin: ICONS.contact,
      make_call: "📞",
      send_email: "📧",
      followup: ICONS.refresh,
    };

    const urgencyColors = {
      urgent: "#ef4444",
      today: "#f59e0b",
      normal: "#525252",
    };

    let html = `${panelHeader("Tarefas do Dia", new Date().toLocaleDateString("pt-BR"))}<div class="pipa-panel-body">`;

    if (tasks.length === 0) {
      html += `
        <div class="pipa-section">
          <div class="pipa-done">
            <div class="pipa-done-icon">${ICONS.check}</div>
            <p class="pipa-done-title">Tudo feito!</p>
            <p class="pipa-done-desc">Nenhuma tarefa pendente para hoje.</p>
          </div>
        </div>
      `;
    } else {
      html += `
        <div class="pipa-section">
          <div class="pipa-info-box">
            <span class="pipa-info-icon">${ICONS.tasks}</span>
            <div>
              <p class="pipa-info-title">${tasks.length} tarefa${tasks.length !== 1 ? "s" : ""} pendente${tasks.length !== 1 ? "s" : ""}</p>
              <p class="pipa-info-desc">Ordenadas por urgencia</p>
            </div>
          </div>
        </div>
        <div class="pipa-section">
      `;

      for (const task of tasks) {
        const companyName = task.companies?.name || "Empresa";
        const signal = task.companies?.buying_signal || "cold";
        const signalClass = slugify(signal) || "cold";
        const typeLabel = taskTypeLabels[task.task_type] || task.task_type;
        const typeIcon = taskTypeIcons[task.task_type] || "";
        const urgColor = urgencyColors[task.urgency] || "#525252";
        const safeTaskId = escapeHtml(task.id || "");
        const safeUrgency = escapeHtml((task.urgency || "normal").toUpperCase());
        const safeSignal = escapeHtml(signal.toUpperCase());
        const safeCompanyName = escapeHtml(companyName);
        const safeTypeLabel = escapeHtml(typeLabel || "");
        const safePersona = escapeHtml(task.persona_type || "");
        const encodedMessage = task.generated_message ? encodeURIComponent(task.generated_message) : "";
        const previewMessage = task.generated_message
          ? escapeHtml(`${task.generated_message.slice(0, 120)}${task.generated_message.length > 120 ? "..." : ""}`)
          : "";

        html += `
          <div class="pipa-task-card" data-task-id="${safeTaskId}">
            <div class="pipa-task-header">
              <div class="pipa-task-urgency" style="background:${urgColor}">${safeUrgency}</div>
              <span class="pipa-signal ${signalClass}">${safeSignal}</span>
            </div>
            <div class="pipa-task-body">
              <p class="pipa-task-company">${safeCompanyName}</p>
              <div class="pipa-task-meta">
                <span class="pipa-task-type">${typeIcon} ${safeTypeLabel}</span>
                ${task.persona_type ? `<span class="pipa-task-persona">${safePersona}</span>` : ""}
                ${task.cadence_day ? `<span class="pipa-task-day">D${escapeHtml(task.cadence_day)}</span>` : ""}
              </div>
            </div>
            ${task.generated_message ? `
              <div class="pipa-task-message">
                <p>${previewMessage}</p>
                <button class="pipa-btn pipa-btn-sm pipa-copy-msg-btn" data-message="${encodedMessage}">
                  ${ICONS.copy} Copiar
                </button>
              </div>
            ` : ""}
            <div class="pipa-task-actions">
              <button class="pipa-btn pipa-btn-primary pipa-task-done-btn" data-task-id="${safeTaskId}">
                ${ICONS.check} Feito
              </button>
              <button class="pipa-btn pipa-btn-secondary pipa-task-skip-btn" data-task-id="${safeTaskId}">
                ${ICONS.skip} Pular
              </button>
            </div>
          </div>
        `;
      }
      html += `</div>`;
    }

    html += `</div>`;
    container.innerHTML = html;
    bindPanelClose();

    // Bind copy buttons
    container.querySelectorAll(".pipa-copy-msg-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(decodeURIComponent(btn.dataset.message || ""));
          btn.innerHTML = `${ICONS.check} Copiado!`;
        } catch (_error) {
          btn.innerHTML = `${ICONS.close} Falhou`;
        }
        setTimeout(() => { btn.innerHTML = `${ICONS.copy} Copiar`; }, 2000);
      });
    });

    // Bind done buttons
    container.querySelectorAll(".pipa-task-done-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        btn.innerHTML = `${ICONS.refresh} ...`;
        btn.disabled = true;
        const res = await msg("COMPLETE_TASK", { taskId: btn.dataset.taskId });
        if (res.ok) {
          const card = btn.closest(".pipa-task-card");
          if (card) { card.style.opacity = "0.3"; card.style.pointerEvents = "none"; }
          updateTasksBadge();
        }
      });
    });

    // Bind skip buttons
    container.querySelectorAll(".pipa-task-skip-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        btn.innerHTML = `${ICONS.refresh} ...`;
        btn.disabled = true;
        const res = await msg("SKIP_TASK", { taskId: btn.dataset.taskId });
        if (res.ok) {
          const card = btn.closest(".pipa-task-card");
          if (card) { card.style.opacity = "0.3"; card.style.pointerEvents = "none"; }
          updateTasksBadge();
        }
      });
    });
  }

  // ── Init ───────────────────────────────────────────────

  async function bootstrapExtension() {
    await bootstrapWaBridge();
    await loadTrackedChats();
    createSidebar();
    createPanelContainer();
    setupConversationWatcher();
    updateTasksBadge();

    currentChat = getCurrentChatContext();
    hydrateMonitorStateFromCurrentChat();

    if (currentChat && trackedChats[currentChat.chatKey]?.enabled) {
      const trackedEntry = trackedChats[currentChat.chatKey];
      const snapshot = createConversationSnapshot(currentChat);
      lastMsgCount = Math.max(snapshot.lineCount, trackedEntry.msgCount || 0);
      if (!trackedEntry.lastFingerprint && snapshot.rawText.trim()) {
        trackedChats[currentChat.chatKey] = {
          ...trackedEntry,
          lastFingerprint: snapshot.fingerprint,
          lastTailFingerprint: snapshot.tailFingerprint,
          lastRawText: snapshot.rawText,
          msgCount: snapshot.lineCount,
        };
        await saveTrackedChats();
      }
      startAutoCapture(currentChat.chatKey);
    }

    updateMonitorDot();
  }

  async function init() {
    await bootstrapWaBridge();
    const ok = await checkAuth();
    if (!ok) {
      console.log("[Pipa] Nao autenticado. Abra o popup da extensao para fazer login.");
      createLoginPrompt();
      return;
    }

    console.log("[Pipa] Autenticado. Injetando sidebar v3...");
    await bootstrapExtension();
  }

  function createLoginPrompt() {
    if (document.getElementById("pipa-login-prompt")) return;

    const prompt = document.createElement("div");
    prompt.id = "pipa-login-prompt";
    prompt.innerHTML = `
      <div class="pipa-login-badge">
        ${ICONS.logo}
        <span>Clique no icone da extensao Pipa para fazer login</span>
        <button id="pipa-dismiss-login">${ICONS.close}</button>
      </div>
    `;
    document.body.appendChild(prompt);

    document.getElementById("pipa-dismiss-login")?.addEventListener("click", () => {
      if (loginPromptTimer) {
        clearInterval(loginPromptTimer);
        loginPromptTimer = null;
      }
      prompt.remove();
    });

    if (loginPromptTimer) clearInterval(loginPromptTimer);
    loginPromptTimer = setInterval(async () => {
      const ok = await checkAuth();
      if (ok) {
        clearInterval(loginPromptTimer);
        loginPromptTimer = null;
        prompt.remove();
        await bootstrapExtension();
      }
    }, 5000);
  }

  // Wait for WhatsApp Web to fully load
  function waitForWA() {
    const check = () => {
      if (document.querySelector("#app") || document.querySelector("[data-testid='chat-list']")) {
        setTimeout(init, 2000);
      } else {
        setTimeout(check, 1000);
      }
    };
    check();
  }

  waitForWA();
})();
