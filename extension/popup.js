const $ = (selector) => document.querySelector(selector);

const loginScreen = $("#login-screen");
const mainScreen = $("#main-screen");
const loginForm = $("#login-form");
const loginBtn = $("#login-btn");
const loginError = $("#login-error");
const logoutBtn = $("#logout-btn");
const userName = $("#user-name");
const userRole = $("#user-role");
const statusCard = $("#status-card");
const statusIcon = $("#status-icon");
const statusTitle = $("#status-title");
const statusDesc = $("#status-desc");
const toggleAnalysis = $("#toggle-analysis");
const toggleTranscription = $("#toggle-transcription");
const toggleCadence = $("#toggle-cadence");
const toggleAutoReply = $("#toggle-auto-reply");
const toggleFeedback = $("#toggle-feedback");
const statMonitoredToday = $("#stat-monitored-today");
const statMonitoredTotal = $("#stat-monitored-total");
const statSavesToday = $("#stat-saves-today");
const statPending = $("#stat-pending");
const pipelineSave = $("#pipeline-save");
const pipelineMessageSync = $("#pipeline-message-sync");
const pipelineUpload = $("#pipeline-upload");
const pipelineAnalysis = $("#pipeline-analysis");
const pipelineTranscription = $("#pipeline-transcription");
const bridgeNote = $("#bridge-note");
const automationCadence = $("#automation-cadence");
const automationAutoReply = $("#automation-auto-reply");
const automationNext = $("#automation-next");

let statsTimer = null;
let settingsBusy = false;

async function sendRuntimeMessage(message) {
  try {
    const response = await chrome.runtime.sendMessage(message);
    return response || { ok: false, error: "Sem resposta do background." };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

function formatRelativeTime(value) {
  if (!value) return "sem registro";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "sem registro";
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin <= 1) return "agora";
  if (diffMin < 60) return `${diffMin} min atras`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `${diffHours} h atras`;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function describeMetric(metric, successLabel, failureLabel) {
  if (!metric) return "sem dados";
  if (metric.pending > 0) return `processando (${metric.pending})`;
  if (metric.last_status === "unavailable") {
    return `indisponivel: ${metric.last_details || metric.last_error || "funcao remota ausente"}`;
  }
  if (metric.last_status === "skipped") {
    return `pulado: ${metric.last_details || formatRelativeTime(metric.last_at)}`;
  }
  if (metric.last_status === "failure") return `${failureLabel}: ${metric.last_error || "erro remoto"}`;
  if (metric.last_status === "success") return `${successLabel}: ${metric.last_details || formatRelativeTime(metric.last_at)}`;
  return "sem atividade";
}

function describeSave(metric) {
  if (!metric) return "sem save";
  if (metric.last_status === "unavailable") return `indisponivel: ${metric.last_details || metric.last_error || "recurso remoto ausente"}`;
  if (metric.last_status === "skipped") return `pulado: ${metric.last_details || formatRelativeTime(metric.last_at)}`;
  if (metric.last_status === "failure") return `falhou: ${metric.last_error || "erro remoto"}`;
  if (metric.last_status === "success") {
    const suffix = metric.last_duplicate
      ? "duplicado"
      : metric.last_details || `${metric.last_message_count || 0} msgs sincronizadas`;
    return `${suffix} · ${formatRelativeTime(metric.last_at)}`;
  }
  return "sem save";
}

function setMainStatus(stats) {
  const monitored = stats.monitored_total || 0;
  const pending = stats.pending_jobs || 0;
  const isWhatsAppOpen = Boolean(stats.whatsapp_open);
  const bridgeRuntime = stats.wa_bridge || {};
  const bridgeConnected = Boolean(bridgeRuntime.connected);
  const monitoredNames = (stats.monitored_names || []).join(", ");

  statusCard.classList.toggle("active", isWhatsAppOpen || monitored > 0 || bridgeConnected);
  statusIcon.textContent = pending > 0 ? "…" : isWhatsAppOpen ? "✔" : "!";

  if (pending > 0) {
    statusTitle.textContent = `Bridge processando ${pending}`;
    statusDesc.textContent = `Save rapido ativo. Pos-processamento rodando em segundo plano.`;
    return;
  }

  if (isWhatsAppOpen && monitored > 0) {
    statusTitle.textContent = `Monitoramento ativo em ${monitored} chat${monitored > 1 ? "s" : ""}`;
    statusDesc.textContent = monitoredNames || (bridgeConnected ? "WhatsApp Web aberto e bridge conectada." : "WhatsApp Web aberto.");
    return;
  }

  if (isWhatsAppOpen) {
    statusTitle.textContent = "WhatsApp Web aberto";
    statusDesc.textContent = bridgeConnected
      ? "Bridge pronta para capturar chats e sincronizar com o CRM."
      : "WhatsApp aberto, aguardando handshake da bridge.";
    return;
  }

  statusTitle.textContent = "Aguardando WhatsApp Web";
  statusDesc.textContent = "Sessao ativa. Abra o WhatsApp Web para ver o monitoramento em tempo real.";
}

function applySettings(stats) {
  const settings = stats.settings || {};
  toggleAnalysis.checked = Boolean(settings.analysisEnabled);
  toggleTranscription.checked = Boolean(settings.transcriptionEnabled);
  toggleCadence.checked = Boolean(settings.cadenceAutomationEnabled);
  toggleAutoReply.checked = Boolean(settings.autoReplyEnabled);
  toggleAnalysis.disabled = settingsBusy;
  toggleTranscription.disabled = settingsBusy;
  toggleCadence.disabled = settingsBusy;
  toggleAutoReply.disabled = settingsBusy;
  const analysisStatus = settings.analysisEnabled
    ? stats.analysis?.last_status === "unavailable"
      ? "IA ligada, funcao indisponivel"
      : "IA ligada"
    : "IA desligada";
  const transcriptionStatus = settings.transcriptionEnabled
    ? stats.transcription?.last_status === "unavailable"
      ? "Transcricao ligada, funcao indisponivel"
      : "Transcricao ligada"
    : "Transcricao desligada";
  toggleFeedback.textContent = `${analysisStatus} · ${transcriptionStatus}`;
}

function formatCountdown(value) {
  if (!value) return "liberado";
  const target = new Date(value).getTime();
  const diff = Math.max(0, target - Date.now());
  if (!diff) return "liberado";
  const totalSeconds = Math.ceil(diff / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${String(minutes).padStart(2, "0")}:${seconds}`;
}

function renderAutomationStats(stats) {
  const automation = stats.automation || {};
  automationCadence.textContent =
    `${automation.cadence_scheduled_today || 0} agendadas hoje · ${automation.cadence_sent_today || 0} enviadas`;
  automationAutoReply.textContent =
    `${automation.auto_reply_waiting || 0} na fila · ${automation.auto_reply_sent_today || 0} enviadas hoje`;

  const nextLabel = formatCountdown(automation.next_send_allowed_at);
  const cadenceState = automation.cadence_enabled ? "cadência ligada" : "cadência desligada";
  const autoState = automation.auto_reply_enabled ? "auto-reply ligado" : "auto-reply desligado";
  automationNext.textContent = `Próximo envio em ${nextLabel} · ${cadenceState} · ${autoState}`;
}

function renderStats(stats) {
  setMainStatus(stats);
  applySettings(stats);
  renderAutomationStats(stats);

  statMonitoredToday.textContent = String(stats.monitored_today ?? 0);
  statMonitoredTotal.textContent = String(stats.monitored_total ?? 0);
  statSavesToday.textContent = String(stats.saves?.today_success ?? 0);
  statPending.textContent = String(stats.pending_jobs ?? 0);

  pipelineSave.textContent = describeSave(stats.saves);
  pipelineMessageSync.textContent = describeMetric(stats.message_sync, "ok", "falhou");
  pipelineUpload.textContent = describeMetric(stats.uploads, "ok", "falhou");
  pipelineAnalysis.textContent = stats.settings?.analysisEnabled
    ? describeMetric(stats.analysis, "ok", "falhou")
    : "desligada";
  pipelineTranscription.textContent = stats.settings?.transcriptionEnabled
    ? describeMetric(stats.transcription, "ok", "falhou")
    : "desligada";

  const syncLabel = stats.last_sync_at ? `Ultimo sync ${formatRelativeTime(stats.last_sync_at)}` : "Nenhum sync recente";
  const bridgeLabel = stats.wa_bridge?.connected
    ? `bridge ${stats.wa_bridge?.source || "ativa"}`
    : "bridge desconectada";
  const waLabel = stats.whatsapp_open ? "WhatsApp aberto" : "WhatsApp fechado";
  bridgeNote.textContent = `${syncLabel} · ${waLabel} · ${bridgeLabel}`;
}

function showLogin() {
  stopPolling();
  loginScreen.classList.remove("hidden");
  mainScreen.classList.add("hidden");
}

function showMain(session) {
  loginScreen.classList.add("hidden");
  mainScreen.classList.remove("hidden");
  userName.textContent = session.profile?.name || session.user?.email || "—";
  userRole.textContent = session.profile?.role || "membro";
  loadRuntimeStats();
  startPolling();
}

async function loadRuntimeStats() {
  const res = await sendRuntimeMessage({ type: "GET_EXTENSION_STATS" });
  if (!res.ok || !res.data) {
    bridgeNote.textContent = res.error || "Nao foi possivel ler o estado da bridge.";
    return;
  }
  renderStats(res.data);
}

function startPolling() {
  stopPolling();
  statsTimer = window.setInterval(() => {
    loadRuntimeStats().catch(() => null);
  }, 4000);
}

function stopPolling() {
  if (statsTimer) {
    window.clearInterval(statsTimer);
    statsTimer = null;
  }
}

async function updateSetting(patch, successText) {
  settingsBusy = true;
  applySettings({
    settings: {
      analysisEnabled: toggleAnalysis.checked,
      transcriptionEnabled: toggleTranscription.checked,
      cadenceAutomationEnabled: toggleCadence.checked,
      autoReplyEnabled: toggleAutoReply.checked,
    },
  });
  toggleFeedback.textContent = "Atualizando configuracao...";
  const res = await sendRuntimeMessage({ type: "UPDATE_EXTENSION_SETTINGS", patch });
  settingsBusy = false;

  if (!res.ok || !res.data) {
    toggleFeedback.textContent = res.error || "Falha ao atualizar configuracao.";
    await loadRuntimeStats();
    return;
  }

  toggleFeedback.textContent = successText;
  await loadRuntimeStats();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.classList.add("hidden");
  loginBtn.disabled = true;
  loginBtn.textContent = "Entrando...";

  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;
  const res = await sendRuntimeMessage({ type: "LOGIN", email, password });

  if (res.ok) {
    showMain(res.data);
  } else {
    loginError.textContent = res.error || "Erro ao fazer login";
    loginError.classList.remove("hidden");
  }

  loginBtn.disabled = false;
  loginBtn.textContent = "Entrar";
});

logoutBtn.addEventListener("click", async () => {
  await sendRuntimeMessage({ type: "LOGOUT" });
  showLogin();
});

toggleAnalysis.addEventListener("change", async () => {
  await updateSetting({ analysisEnabled: toggleAnalysis.checked }, `Analise de IA ${toggleAnalysis.checked ? "ligada" : "desligada"}.`);
});

toggleTranscription.addEventListener("change", async () => {
  await updateSetting({ transcriptionEnabled: toggleTranscription.checked }, `Transcricao de audio ${toggleTranscription.checked ? "ligada" : "desligada"}.`);
});

toggleCadence.addEventListener("change", async () => {
  await updateSetting({ cadenceAutomationEnabled: toggleCadence.checked }, `Cadência automatizada ${toggleCadence.checked ? "ligada" : "desligada"}.`);
});

toggleAutoReply.addEventListener("change", async () => {
  await updateSetting({ autoReplyEnabled: toggleAutoReply.checked }, `Auto-reply IA ${toggleAutoReply.checked ? "ligado" : "desligado"}.`);
});

async function init() {
  const res = await sendRuntimeMessage({ type: "GET_SESSION" });
  if (res.ok && res.data) {
    showMain(res.data);
  } else {
    showLogin();
  }
}

window.addEventListener("unload", stopPolling);

init().catch(() => showLogin());
