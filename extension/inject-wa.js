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

  // wa-js é carregado pelo content script (injectWaJsBundle) e já está
  // disponível como window.WPP quando este script executa. Se por algum
  // motivo ainda não estiver, aguardamos em polling curto.
  function loadWaJs() {
    return new Promise((resolve, reject) => {
      const maxWaitMs = 20000;
      const start = Date.now();
      (function check() {
        if (window.WPP && window.WPP.webpack && typeof window.WPP.webpack.onReady === "function") {
          window.WPP.webpack.onReady(() => {
            waReady = true;
            resolve();
            while (pendingReady.length) pendingReady.shift()();
          });
          return;
        }
        if (Date.now() - start > maxWaitMs) {
          reject(new Error("WPP não ficou disponível (bundle local não carregou?)"));
          return;
        }
        setTimeout(check, 150);
      })();
    });
  }

  function whenReady() {
    if (waReady) return Promise.resolve();
    return new Promise((resolve) => pendingReady.push(resolve));
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
    return msgs.map(serializeMessage);
  }

  function serializeMessage(m) {
    const id = m.id?._serialized || String(m.id);
    const ts = m.t ? m.t * 1000 : Date.now();
    return {
      wa_msg_id: id,
      chat_id: m.from?._serialized || m.to?._serialized || null,
      from_me: !!m.fromMe,
      author: m.author?._serialized || m.from?._serialized || null,
      type: m.type || "chat",
      body: m.body || m.caption || "",
      timestamp: new Date(ts).toISOString(),
      has_media: !!m.mediaKey || !!m.isMedia,
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

  loadWaJs()
    .then(() => {
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
