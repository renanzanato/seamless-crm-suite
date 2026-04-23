// ──────────────────────────────────────────────────────────
// Pipa Driven — wa-js capture (botão no sidebar)
// ──────────────────────────────────────────────────────────
// Este módulo NÃO cria FAB. Ele apenas:
//   1. Injeta o bundle wa-js na página (via wa-bridge)
//   2. Expõe window.PipaCapture.captureCurrentChat() pra ser
//      chamado pelo botão do sidebar (content.js)
// ──────────────────────────────────────────────────────────

(function () {
  "use strict";

  if (window.__pipaCaptureReady) return;
  window.__pipaCaptureReady = true;

  const DEFAULT_COUNT = 200;

  async function captureCurrentChat(count = DEFAULT_COUNT) {
    const bridge = window.PipaWaBridge;
    if (!bridge) throw new Error("Bridge wa-js não carregou. Recarregue a página.");

    await bridge.whenReady();
    const { chat, messages } = await bridge.getCurrentChatHistory(count);

    if (!chat) throw new Error("Nenhuma conversa aberta. Abra um chat e tente de novo.");
    if (chat.is_group) throw new Error("Captura de grupos ainda não suportada.");

    const response = await chrome.runtime.sendMessage({
      type: "PIPA_INGEST_CHAT",
      payload: { chat, messages },
    });

    if (!response?.ok) throw new Error(response?.error || "Falha desconhecida no ingest");
    return { chat, response };
  }

  // ── Boot ────────────────────────────────────────────────
  function boot() {
    const bridge = window.PipaWaBridge;
    if (!bridge) {
      console.warn("[Pipa] wa-bridge não carregou; capture desabilitado.");
      return;
    }
    bridge.injectScript();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  // Expõe API global consumida pelo content.js/sidebar
  window.PipaCapture = { captureCurrentChat };
})();
