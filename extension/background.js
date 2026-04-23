// Pipa Driven bridge background service worker.

const SUPABASE_URL = "https://dsvkoeomtnwccxxcwwga.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzdmtvZW9tdG53Y2N4eGN3d2dhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzOTkyOTIsImV4cCI6MjA5MDk3NTI5Mn0.lKYhSA9LO8Zpx8DANxj9lfa1CYeQBBCx7LBQC3sq1y8";
const EXTENSION_SETTINGS_KEY = "pipa_extension_settings";
const BRIDGE_STATE_KEY = "pipa_bridge_state";
const WA_BRIDGE_RUNTIME_KEY = "pipa_wa_bridge_runtime";
const AUTOMATION_RUNTIME_KEY = "pipa_automation_runtime";
const AUTOMATION_ALARM = "pipa-automation-tick";
const DEFAULT_MEDIA_BUCKET = "whatsapp-media";
const DEFAULT_ANALYSIS_FUNCTION = "analyze-conversation";
const DEFAULT_TRANSCRIPTION_FUNCTION = "transcribe-whatsapp-audio";
const DEFAULT_AUTO_REPLY_FUNCTION = "auto-reply-generate";
const AUTOMATION_PERIOD_MINUTES = 5;
const AUTOMATION_SEND_INTERVAL_MS = 90 * 1000;
const AUTO_REPLY_DELAY_MINUTES = 10;
const SELF_SENDER_MARKERS = ["renan", "pipa", "me", "eu"];
const unavailableEdgeFunctions = new Set();

function getTodayKey() {
  const current = new Date();
  const year = current.getFullYear();
  const month = String(current.getMonth() + 1).padStart(2, "0");
  const day = String(current.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function nowIso() {
  return new Date().toISOString();
}

function createDefaultSettings() {
  return {
    analysisEnabled: true,
    transcriptionEnabled: true,
    cadenceAutomationEnabled: false,
    autoReplyEnabled: false,
    mediaBucket: DEFAULT_MEDIA_BUCKET,
    analysisFunction: DEFAULT_ANALYSIS_FUNCTION,
    transcriptionFunction: DEFAULT_TRANSCRIPTION_FUNCTION,
    autoReplyFunction: DEFAULT_AUTO_REPLY_FUNCTION,
  };
}

function createDefaultCounterMetric() {
  return {
    day: getTodayKey(),
    today_success: 0,
    today_failure: 0,
    total_success: 0,
    total_failure: 0,
    pending: 0,
    last_status: "idle",
    last_error: null,
    last_at: null,
    last_details: null,
  };
}

function createDefaultSaveMetric() {
  return {
    day: getTodayKey(),
    today_success: 0,
    today_failure: 0,
    today_duplicates: 0,
    total_success: 0,
    total_failure: 0,
    total_duplicates: 0,
    last_status: "idle",
    last_error: null,
    last_at: null,
    last_details: null,
    last_chat_key: null,
    last_conversation_id: null,
    last_message_count: 0,
    last_duplicate: false,
  };
}

function createDefaultBridgeState() {
  return {
    updated_at: null,
    saves: createDefaultSaveMetric(),
    message_sync: createDefaultCounterMetric(),
    uploads: createDefaultCounterMetric(),
    analysis: createDefaultCounterMetric(),
    transcription: createDefaultCounterMetric(),
  };
}

function createDefaultWaBridgeRuntime() {
  return {
    connected: false,
    injected: false,
    wa_state: "unknown",
    source: "bootstrap",
    current_chat_key: null,
    current_chat_name: null,
    last_event_at: null,
    updated_at: null,
    capabilities: {},
  };
}

function createDefaultAutomationRuntime() {
  return {
    last_send_at: null,
    next_send_allowed_at: null,
    cadence_last_status: "idle",
    cadence_last_error: null,
    cadence_last_at: null,
    auto_reply_last_status: "idle",
    auto_reply_last_error: null,
    auto_reply_last_at: null,
  };
}

function normalizeCounterMetric(metric) {
  const defaults = createDefaultCounterMetric();
  const next = { ...defaults, ...(metric || {}) };
  if (next.day !== defaults.day) {
    next.day = defaults.day;
    next.today_success = 0;
    next.today_failure = 0;
  }
  next.pending = Math.max(0, Number(next.pending || 0));
  return next;
}

function normalizeSaveMetric(metric) {
  const defaults = createDefaultSaveMetric();
  const next = { ...defaults, ...(metric || {}) };
  if (next.day !== defaults.day) {
    next.day = defaults.day;
    next.today_success = 0;
    next.today_failure = 0;
    next.today_duplicates = 0;
  }
  next.last_message_count = Number(next.last_message_count || 0);
  next.last_duplicate = Boolean(next.last_duplicate);
  return next;
}

function normalizeSettings(settings) {
  return { ...createDefaultSettings(), ...(settings || {}) };
}

function normalizeBridgeState(state) {
  const defaults = createDefaultBridgeState();
  return {
    ...defaults,
    ...(state || {}),
    saves: normalizeSaveMetric(state?.saves),
    message_sync: normalizeCounterMetric(state?.message_sync),
    uploads: normalizeCounterMetric(state?.uploads),
    analysis: normalizeCounterMetric(state?.analysis),
    transcription: normalizeCounterMetric(state?.transcription),
  };
}

function normalizeWaBridgeRuntime(state) {
  const defaults = createDefaultWaBridgeRuntime();
  return {
    ...defaults,
    ...(state || {}),
    capabilities:
      state?.capabilities && typeof state.capabilities === "object"
        ? state.capabilities
        : defaults.capabilities,
  };
}

function normalizeAutomationRuntime(state) {
  return {
    ...createDefaultAutomationRuntime(),
    ...(state || {}),
  };
}

async function ensureExtensionBootState() {
  const current = await chrome.storage.local.get([
    EXTENSION_SETTINGS_KEY,
    BRIDGE_STATE_KEY,
    WA_BRIDGE_RUNTIME_KEY,
    AUTOMATION_RUNTIME_KEY,
  ]);
  const nextState = {};
  if (!current[EXTENSION_SETTINGS_KEY]) nextState[EXTENSION_SETTINGS_KEY] = createDefaultSettings();
  if (!current[BRIDGE_STATE_KEY]) nextState[BRIDGE_STATE_KEY] = createDefaultBridgeState();
  if (!current[WA_BRIDGE_RUNTIME_KEY]) nextState[WA_BRIDGE_RUNTIME_KEY] = createDefaultWaBridgeRuntime();
  if (!current[AUTOMATION_RUNTIME_KEY]) nextState[AUTOMATION_RUNTIME_KEY] = createDefaultAutomationRuntime();
  if (Object.keys(nextState).length) await chrome.storage.local.set(nextState);
  ensureAutomationAlarm();
}

let bridgeStateWriteQueue = Promise.resolve();

async function getExtensionSettings() {
  const result = await chrome.storage.local.get([EXTENSION_SETTINGS_KEY]);
  return normalizeSettings(result[EXTENSION_SETTINGS_KEY]);
}

async function updateExtensionSettings(patch) {
  const current = await getExtensionSettings();
  const next = normalizeSettings({ ...current, ...(patch || {}) });
  await chrome.storage.local.set({ [EXTENSION_SETTINGS_KEY]: next });
  return next;
}

async function getBridgeState() {
  const result = await chrome.storage.local.get([BRIDGE_STATE_KEY]);
  return normalizeBridgeState(result[BRIDGE_STATE_KEY]);
}

async function getWaBridgeRuntime() {
  const result = await chrome.storage.local.get([WA_BRIDGE_RUNTIME_KEY]);
  return normalizeWaBridgeRuntime(result[WA_BRIDGE_RUNTIME_KEY]);
}

async function getAutomationRuntime() {
  const result = await chrome.storage.local.get([AUTOMATION_RUNTIME_KEY]);
  return normalizeAutomationRuntime(result[AUTOMATION_RUNTIME_KEY]);
}

async function updateAutomationRuntime(patch) {
  const current = await getAutomationRuntime();
  const next = normalizeAutomationRuntime({ ...current, ...(patch || {}) });
  await chrome.storage.local.set({ [AUTOMATION_RUNTIME_KEY]: next });
  return next;
}

async function updateWaBridgeRuntime(snapshot) {
  const current = await getWaBridgeRuntime();
  const next = normalizeWaBridgeRuntime({
    ...current,
    connected: Boolean(snapshot?.connected),
    injected: Boolean(snapshot?.injected),
    wa_state: snapshot?.wa_state || snapshot?.waState || current.wa_state,
    source: snapshot?.source || current.source,
    current_chat_key:
      snapshot?.current_chat?.chatKey ||
      snapshot?.current_chat_key ||
      current.current_chat_key,
    current_chat_name:
      snapshot?.current_chat?.displayName ||
      snapshot?.current_chat_name ||
      current.current_chat_name,
    last_event_at: snapshot?.last_event_at || snapshot?.lastEventAt || current.last_event_at,
    updated_at: nowIso(),
    capabilities:
      snapshot?.capabilities && typeof snapshot.capabilities === "object"
        ? snapshot.capabilities
        : current.capabilities,
  });
  await chrome.storage.local.set({ [WA_BRIDGE_RUNTIME_KEY]: next });
  return next;
}

function queueBridgeStateUpdate(mutator) {
  bridgeStateWriteQueue = bridgeStateWriteQueue
    .then(async () => {
      const draft = await getBridgeState();
      const next = normalizeBridgeState(typeof mutator === "function" ? await mutator(draft) : draft);
      next.updated_at = nowIso();
      await chrome.storage.local.set({ [BRIDGE_STATE_KEY]: next });
      return next;
    })
    .catch((error) => {
      console.warn("[Pipa] Bridge state update failed:", error);
      return getBridgeState();
    });
  return bridgeStateWriteQueue;
}

function updateCounterMetric(metric, status, details, error) {
  const next = normalizeCounterMetric(metric);
  next.last_status = status;
  next.last_at = nowIso();
  next.last_details = details ?? null;
  next.last_error = getErrorMessage(error);
  if (status === "started") next.pending += 1;
  if (["success", "failure", "unavailable", "skipped"].includes(status)) {
    next.pending = Math.max(0, next.pending - 1);
  }
  if (status === "success") {
    next.today_success += 1;
    next.total_success += 1;
  }
  if (status === "failure") {
    next.today_failure += 1;
    next.total_failure += 1;
  }
  return next;
}

function markAsyncMetricStart(section, details) {
  return queueBridgeStateUpdate((state) => {
    state[section] = updateCounterMetric(state[section], "started", details, null);
    return state;
  });
}

function markAsyncMetricFinish(section, status, details, error) {
  return queueBridgeStateUpdate((state) => {
    state[section] = updateCounterMetric(state[section], status, details, error);
    return state;
  });
}

function markSaveMetric(status, details) {
  return queueBridgeStateUpdate((state) => {
    const next = normalizeSaveMetric(state.saves);
    next.last_status = status;
    next.last_at = nowIso();
    next.last_error = getErrorMessage(details?.error);
    next.last_details = details?.summary ?? null;
    if (details?.chatKey) next.last_chat_key = details.chatKey;
    if (details?.conversationId) next.last_conversation_id = details.conversationId;
    if (typeof details?.messageCount === "number") next.last_message_count = details.messageCount;
    next.last_duplicate = Boolean(details?.duplicate);
    if (status === "success") {
      next.today_success += 1;
      next.total_success += 1;
      if (details?.duplicate) {
        next.today_duplicates += 1;
        next.total_duplicates += 1;
      }
    }
    if (status === "failure") {
      next.today_failure += 1;
      next.total_failure += 1;
    }
    state.saves = next;
    return state;
  });
}

function getPendingOperationsCount(state) {
  const current = normalizeBridgeState(state);
  return [current.message_sync.pending, current.uploads.pending, current.analysis.pending, current.transcription.pending]
    .reduce((sum, value) => sum + Number(value || 0), 0);
}

function compactWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parseJsonSafely(value) {
  if (!value || typeof value !== "string") return value && typeof value === "object" ? value : null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeRemoteError(source, status, rawBody, meta = {}) {
  const parsed = typeof rawBody === "string" ? (parseJsonSafely(rawBody) ?? compactWhitespace(rawBody)) : rawBody;
  const payload = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  const code = payload?.code || null;
  const message = compactWhitespace(
    payload?.message ||
      payload?.error_description ||
      payload?.error ||
      payload?.msg ||
      (typeof parsed === "string" ? parsed : "")
  );
  const details = compactWhitespace(payload?.details || "");

  if (source === "Edge" && (status === 404 || code === "NOT_FOUND")) {
    return {
      code: code || "NOT_FOUND",
      message: `funcao ${meta.functionName || "remota"} indisponivel neste projeto`,
      unavailable: true,
    };
  }

  if (code === "23505" || status === 409) {
    if (details.includes("whatsapp_conversations_chat_key_key")) {
      return {
        code: code || "23505",
        message: "chat ja cadastrado para este chat",
        unavailable: false,
      };
    }
    return { code: code || "23505", message: "registro duplicado", unavailable: false };
  }

  if ((code === "PGRST204" || status === 400) && details.includes("could not find the 'media' column")) {
    return {
      code: code || "PGRST204",
      message: "coluna media ausente em whatsapp_messages",
      unavailable: false,
    };
  }

  const summary = [message, details]
    .filter((value, index, items) => value && items.indexOf(value) === index)
    .join(" · ");

  return {
    code,
    message: summary || `${source.toLowerCase()} ${status}`,
    unavailable: false,
  };
}

function getErrorMessage(error) {
  if (!error) return null;
  return compactWhitespace(error instanceof Error ? error.message : String(error));
}

function isEdgeFunctionUnavailable(functionName) {
  return unavailableEdgeFunctions.has(functionName);
}

function buildConversationRecordPayload(payload, rawText, normalizedPhone, chatKey, contentHash, messageCount) {
  return {
    company_id: payload.company_id || null,
    contact_id: payload.contact_id || null,
    company_name: payload.company_name || null,
    contact_name: payload.contact_name || null,
    raw_text: rawText,
    phone_number: normalizedPhone,
    chat_key: chatKey,
    content_hash: contentHash,
    message_count: messageCount,
    source: payload.source || "extension",
    cadence_day: payload.cadence_day || null,
    persona_type: payload.persona_type || null,
  };
}

function buildChangedFields(current, next) {
  const patch = {};
  Object.entries(next).forEach(([key, value]) => {
    const currentValue = current?.[key] ?? null;
    const nextValue = value ?? null;
    if (currentValue !== nextValue) patch[key] = nextValue;
  });
  return patch;
}

function decodeBase64(value) {
  const normalized = String(value || "").replace(/\s/g, "");
  if (typeof atob === "function") {
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }
  if (typeof Buffer !== "undefined") return Uint8Array.from(Buffer.from(normalized, "base64"));
  throw new Error("Base64 decode indisponivel neste contexto.");
}

function dataUrlToBinary(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Data URL invalida para upload.");
  return { mimeType: match[1], bytes: decodeBase64(match[2]) };
}

function normalizePhone(value) {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, "");
  return digits || null;
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sanitizePathSegment(value) {
  return slugify(value) || "item";
}

async function hashText(value) {
  const data = new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function countMessages(rawText) {
  if (!rawText) return 0;
  return String(rawText).split("\n").map((line) => line.trim()).filter(Boolean).length;
}

function normalizeComparableText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeComparableSender(value) {
  return normalizeComparableText(value).replace(/[^a-z0-9 ]+/g, "");
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}
function splitConversationText(rawText) {
  const lines = String(rawText || "").split(/\r?\n/).map((line) => line.trimEnd());
  const messages = [];
  let current = null;
  const headerRegex = /^(?:\[(?<stamp>[^\]]+)\]\s*)?(?<sender>[^:]+):\s*(?<body>.*)$/;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(headerRegex);
    if (match) {
      if (current) messages.push(current);
      current = {
        stamp: match.groups?.stamp || null,
        sender: (match.groups?.sender || "").trim(),
        body: (match.groups?.body || "").trim(),
        source: line,
      };
      continue;
    }
    if (!current) {
      current = { stamp: null, sender: "", body: line, source: line };
      continue;
    }
    current.body = current.body ? `${current.body}\n${line}` : line;
    current.source = `${current.source}\n${line}`;
  }

  if (current) messages.push(current);
  return messages;
}

function parseOccurredAt(rawStamp, fallbackOccurredAt) {
  if (fallbackOccurredAt) {
    const parsedFallback = new Date(fallbackOccurredAt);
    if (!Number.isNaN(parsedFallback.getTime())) return parsedFallback.toISOString();
  }
  if (!rawStamp) return nowIso();

  const stamp = String(rawStamp).trim();
  const fullMatch = stamp.match(/(?:(\d{1,2})\/(\d{1,2})\/(\d{2,4}))?(?:,?\s*)?(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!fullMatch) {
    const parsed = new Date(stamp);
    return Number.isNaN(parsed.getTime()) ? nowIso() : parsed.toISOString();
  }

  const day = Number(fullMatch[1] || new Date().getDate());
  const month = Number(fullMatch[2] || new Date().getMonth() + 1);
  const yearRaw = Number(fullMatch[3] || new Date().getFullYear());
  const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
  const hour = Number(fullMatch[4] || 0);
  const minute = Number(fullMatch[5] || 0);
  const second = Number(fullMatch[6] || 0);
  const parsed = new Date(year, month - 1, day, hour, minute, second);
  return Number.isNaN(parsed.getTime()) ? nowIso() : parsed.toISOString();
}

function inferDirection(sender, payload, fallbackDirection) {
  if (fallbackDirection === "inbound" || fallbackDirection === "outbound") return fallbackDirection;
  const senderKey = normalizeComparableSender(sender);
  if (!senderKey) return "inbound";
  if (SELF_SENDER_MARKERS.some((marker) => senderKey.includes(marker))) return "outbound";

  const contactNames = [payload?.contact_name, payload?.display_name, payload?.chat_display_name]
    .filter(Boolean)
    .map((value) => normalizeComparableSender(value));

  if (contactNames.some((value) => value && senderKey.includes(value))) return "inbound";
  return senderKey ? "inbound" : "outbound";
}

function guessMessageType(item) {
  const explicit = item?.message_type || item?.type || item?.kind;
  if (explicit) return String(explicit).toLowerCase();
  const mimeType = String(item?.mime_type || item?.mimeType || "").toLowerCase();
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.includes("pdf") || mimeType.includes("document")) return "document";
  return "text";
}

function buildMessageBody(item, messageType, direction) {
  const candidates = [item?.body, item?.text, item?.caption, item?.message];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  if (messageType === "audio") return direction === "outbound" ? "[Audio enviado]" : "[Audio recebido]";
  if (messageType === "image") return direction === "outbound" ? "[Imagem enviada]" : "[Imagem recebida]";
  if (messageType === "video") return direction === "outbound" ? "[Video enviado]" : "[Video recebido]";
  if (messageType === "document") return direction === "outbound" ? "[Documento enviado]" : "[Documento recebido]";
  return "[Mensagem sem texto]";
}

async function normalizeMessageRecord(item, payload, chatKey, index) {
  const direction = inferDirection(item.sender_name || item.sender, payload, item.direction);
  const messageType = guessMessageType(item);
  const occurredAt = parseOccurredAt(item.raw_stamp || item.stamp || item.occurred_at, payload.occurred_at);
  const body = buildMessageBody(item, messageType, direction);
  const fingerprintSource = item.message_fingerprint_source || item.raw_source || item.source || [
    chatKey,
    item.sender_name || item.sender || "",
    direction,
    messageType,
    item.occurred_at || occurredAt,
    body,
    item.external_id || item.id || index,
  ].join("|");

  return {
    chat_key: chatKey,
    company_id: payload.company_id || null,
    contact_id: payload.contact_id || null,
    direction,
    message_type: messageType,
    occurred_at: occurredAt,
    body,
    message_fingerprint: item.message_fingerprint ? String(item.message_fingerprint) : await hashText(fingerprintSource),
    media: asArray(item.media || item.attachments),
  };
}

async function buildMessageRecords(payload, chatKey) {
  const explicitMessages = asArray(payload.messages);
  const sourceMessages = explicitMessages.length
    ? explicitMessages.map((item) => ({ ...item, raw_source: item.raw_source || item.body || item.text || item.caption || "" }))
    : splitConversationText(payload.raw_text).map((item) => ({ sender: item.sender, body: item.body, raw_stamp: item.stamp, raw_source: item.source }));

  if (!sourceMessages.length) return [];
  const normalized = [];
  for (let index = 0; index < sourceMessages.length; index += 1) {
    normalized.push(await normalizeMessageRecord(sourceMessages[index], payload, chatKey, index));
  }
  return normalized;
}

function buildPostgrestInList(values) {
  return `(${values.map((value) => `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")})`;
}

function getExtensionFromMimeType(mimeType) {
  const normalized = String(mimeType || "").toLowerCase();
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("mpeg") || normalized.includes("mp3")) return "mp3";
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("mp4")) return "mp4";
  if (normalized.includes("webm")) return "webm";
  if (normalized.includes("jpeg")) return "jpg";
  if (normalized.includes("png")) return "png";
  if (normalized.includes("pdf")) return "pdf";
  return "bin";
}

async function getSession() {
  const result = await chrome.storage.local.get(["pipa_session"]);
  return result.pipa_session ?? null;
}

async function refreshSession() {
  const session = await getSession();
  if (!session?.refresh_token) return null;

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const newSession = { ...session, access_token: data.access_token, refresh_token: data.refresh_token, expires_at: data.expires_at };
    await chrome.storage.local.set({ pipa_session: newSession });
    return newSession;
  } catch (error) {
    console.warn("[Pipa] Token refresh failed:", error);
    return null;
  }
}

async function getAuthorizedSession() {
  let session = await getSession();
  if (session?.expires_at && session.expires_at < Math.floor(Date.now() / 1000) + 60) {
    const refreshed = await refreshSession();
    if (refreshed) session = refreshed;
  }
  return session;
}

async function parseResponseBody(response, expect = "json") {
  if (expect === "raw") return response;
  const text = await response.text();
  if (!text) return expect === "text" ? "" : null;
  if (expect === "text") return text;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return JSON.parse(text);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function requestSupabase(path, options = {}) {
  let session = await getAuthorizedSession();
  const expect = options.expect || "json";
  const requestHeaders = {
    apikey: SUPABASE_ANON_KEY,
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    ...(options.headers || {}),
  };

  let body = options.body;
  if (options.json !== undefined) {
    requestHeaders["Content-Type"] = requestHeaders["Content-Type"] || "application/json";
    body = JSON.stringify(options.json);
  }

  const performFetch = async (headers) => {
    const response = await fetch(`${SUPABASE_URL}${path}`, {
      method: options.method || "GET",
      headers,
      body,
      keepalive: Boolean(options.keepalive),
    });
    if (!response.ok) {
      const rawError = await parseResponseBody(response, "text");
      const normalized = normalizeRemoteError("Supabase", response.status, rawError);
      const error = new Error(normalized.message);
      error.code = normalized.code;
      error.status = response.status;
      throw error;
    }
    return parseResponseBody(response, expect);
  };

  try {
    return await performFetch(requestHeaders);
  } catch (error) {
    const canRetry = Number(error?.status || 0) === 401 && session?.refresh_token;
    if (!canRetry) throw error;
    const refreshed = await refreshSession();
    if (!refreshed) throw error;
    return performFetch({ ...requestHeaders, Authorization: `Bearer ${refreshed.access_token}` });
  }
}

function supabaseFetch(path, options = {}) {
  return requestSupabase(path, { ...options, expect: "json" });
}

async function fireEdgeFunction(functionName, session, payload) {
  if (isEdgeFunctionUnavailable(functionName)) {
    const error = new Error(`funcao ${functionName} indisponivel neste projeto`);
    error.code = "NOT_FOUND";
    error.status = 404;
    error.unavailable = true;
    throw error;
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: "POST",
    keepalive: true,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const rawError = await parseResponseBody(response, "text");
    const normalized = normalizeRemoteError("Edge", response.status, rawError, { functionName });
    if (normalized.unavailable) unavailableEdgeFunctions.add(functionName);
    const error = new Error(normalized.message);
    error.code = normalized.code;
    error.status = response.status;
    error.unavailable = normalized.unavailable;
    throw error;
  }
  return parseResponseBody(response, "json");
}

async function login(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error_description || err.msg || "Login falhou");
  }

  const data = await res.json();
  const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${data.user.id}&select=id,name,role`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${data.access_token}` },
  });
  const profiles = await profileRes.json();
  if (!profileRes.ok || !Array.isArray(profiles) || !profiles[0]) {
    throw new Error("Usuario nao autorizado. Somente membros da Pipa Driven.");
  }

  const session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
    user: { id: data.user.id, email: data.user.email },
    profile: profiles[0],
  };
  await chrome.storage.local.set({ pipa_session: session });
  return session;
}

async function logout() {
  await chrome.storage.local.remove([
    "pipa_session",
    "pipa_tracked_chats",
    "pipa_tracked",
    BRIDGE_STATE_KEY,
  ]);
  await ensureExtensionBootState();
}

async function searchCompanies(query) {
  const term = String(query || "").trim();
  if (!term) return [];
  return supabaseFetch(`/rest/v1/companies?name=ilike.*${encodeURIComponent(term)}*&select=id,name,buying_signal,cadence_day,cadence_status&order=name&limit=10`);
}

async function searchContacts(companyId, query = "") {
  const filters = [`company_id=eq.${encodeURIComponent(companyId)}`, "select=id,name,role,whatsapp,email", "order=name"];
  const term = String(query || "").trim();
  if (term) filters.unshift(`name=ilike.*${encodeURIComponent(term)}*`);
  return supabaseFetch(`/rest/v1/contacts?${filters.join("&")}`);
}

async function matchContact(phone, name) {
  const normalizedPhone = normalizePhone(phone);
  // 1. Match by phone (highest confidence)
  if (normalizedPhone) {
    const byPhone = await supabaseFetch(
      `/rest/v1/contacts?whatsapp=ilike.*${encodeURIComponent(normalizedPhone)}*&select=id,name,role,whatsapp,email,company_id,companies(id,name,buying_signal,cadence_day,cadence_status)&limit=5`
    );
    if (byPhone?.length === 1) return { found: true, contact: byPhone[0], match_type: "phone" };
    if (byPhone?.length > 1) return { found: false, suggestions: byPhone, match_type: "ambiguous" };
  }
  // 2. Match by name (fallback — fuzzy)
  const term = String(name || "").trim();
  if (term && term.length >= 2) {
    const byName = await supabaseFetch(
      `/rest/v1/contacts?name=ilike.*${encodeURIComponent(term)}*&select=id,name,role,whatsapp,email,company_id,companies(id,name,buying_signal,cadence_day,cadence_status)&limit=5`
    );
    if (byName?.length === 1) return { found: true, contact: byName[0], match_type: "name" };
    if (byName?.length > 1) return { found: false, suggestions: byName, match_type: "ambiguous" };
  }
  return { found: false, suggestions: [], match_type: "none" };
}

async function createContact(companyId, name, phone) {
  const normalizedPhone = normalizePhone(phone);
  const contacts = await supabaseFetch("/rest/v1/contacts", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    json: {
      company_id: companyId,
      name: String(name || "").trim(),
      whatsapp: normalizedPhone || null,
    },
  });
  return contacts?.[0] || null;
}
async function fetchExistingMessageFingerprints(chatKey, fingerprints) {
  const existing = new Set();
  const chunkSize = 50;
  for (let index = 0; index < fingerprints.length; index += chunkSize) {
    const chunk = fingerprints.slice(index, index + chunkSize);
    const rows = await supabaseFetch(`/rest/v1/whatsapp_messages?select=message_fingerprint&chat_key=eq.${encodeURIComponent(chatKey)}&message_fingerprint=in.${encodeURIComponent(buildPostgrestInList(chunk))}`);
    for (const row of rows || []) {
      if (row?.message_fingerprint) existing.add(String(row.message_fingerprint));
    }
  }
  return existing;
}

async function updateCompanyLastInteraction(companyId, occurredAt) {
  if (!companyId) return null;
  return supabaseFetch(`/rest/v1/companies?id=eq.${encodeURIComponent(companyId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    json: { last_interaction_at: occurredAt || nowIso() },
    keepalive: true,
  });
}

async function cancelWaitingAutoReplies(chatKey, reason = "manual_reply") {
  if (!chatKey) return null;
  return supabaseFetch(
    `/rest/v1/auto_reply_queue?chat_key=eq.${encodeURIComponent(chatKey)}&status=eq.waiting`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      json: {
        status: "cancelled",
        error: reason,
        processed_at: nowIso(),
      },
      keepalive: true,
    }
  );
}

async function createAutoReplyQueueForInbound(session, payload, messageRow) {
  if (!messageRow?.id || !messageRow?.chat_key) return null;
  if (!messageRow.company_id || !messageRow.contact_id) return null;

  await cancelWaitingAutoReplies(messageRow.chat_key, "nova_resposta_do_lead");

  const triggerAt = new Date(Date.now() + AUTO_REPLY_DELAY_MINUTES * 60 * 1000).toISOString();
  const rows = await supabaseFetch("/rest/v1/auto_reply_queue", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    json: {
      company_id: messageRow.company_id,
      contact_id: messageRow.contact_id,
      chat_key: messageRow.chat_key,
      triggered_by_message_id: messageRow.id,
      trigger_at: triggerAt,
      status: "waiting",
      created_by: session.user.id,
    },
    keepalive: true,
  });
  return rows?.[0] || null;
}

async function handleMessageSideEffects(session, payload, rows, settings) {
  for (const row of rows || []) {
    try {
      if (row.direction === "inbound") {
        await updateCompanyLastInteraction(row.company_id || payload.company_id, row.occurred_at);
        if (settings.autoReplyEnabled) {
          await createAutoReplyQueueForInbound(session, payload, row);
        }
      }

      if (row.direction === "outbound" && settings.autoReplyEnabled) {
        await cancelWaitingAutoReplies(row.chat_key || payload.chat_key, "resposta_manual_detectada");
      }
    } catch (error) {
      console.warn("[Pipa] Message side effect failed:", error);
    }
  }
}

async function persistMessages(session, payload, chatKey, settings = createDefaultSettings()) {
  const records = await buildMessageRecords(payload, chatKey);
  if (!records.length) return { total: 0, inserted: 0, duplicates: 0, records: [] };

  const fingerprints = records.map((record) => record.message_fingerprint);
  const existingFingerprints = await fetchExistingMessageFingerprints(chatKey, fingerprints);
  const missingRecords = records.filter((record) => !existingFingerprints.has(record.message_fingerprint));
  const dbRows = missingRecords.map((record) => ({
    ...record,
    media: record.media || [],
    created_by: session.user.id,
  }));
  let insertedRows = [];

  if (dbRows.length) {
    insertedRows = await requestSupabase("/rest/v1/whatsapp_messages?on_conflict=chat_key,message_fingerprint", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      json: dbRows,
      keepalive: true,
    }) || [];
    await handleMessageSideEffects(session, payload, insertedRows, settings);
  }

  return {
    total: records.length,
    inserted: insertedRows.length,
    duplicates: records.length - missingRecords.length,
    records: missingRecords,
    rows: insertedRows,
  };
}

async function resolveUploadBinary(media) {
  if (media?.bytes instanceof Uint8Array) return media.bytes;
  if (media?.bytes instanceof ArrayBuffer) return new Uint8Array(media.bytes);
  if (media?.buffer instanceof ArrayBuffer) return new Uint8Array(media.buffer);
  if (typeof media?.base64 === "string") return decodeBase64(media.base64);
  if (typeof media?.data_url === "string") {
    const parsed = dataUrlToBinary(media.data_url);
    if (!media.mime_type && !media.mimeType) media.mime_type = parsed.mimeType;
    return parsed.bytes;
  }
  throw new Error("Midia sem bytes/base64/data_url para upload.");
}

async function normalizeMediaItem(media, fallback) {
  if (!media) return null;
  const messageType = guessMessageType({
    message_type: media.message_type || fallback.message_type,
    mime_type: media.mime_type || media.mimeType,
  });
  const mimeType = media.mime_type || media.mimeType || "application/octet-stream";
  const fileName = media.file_name || media.filename || `${messageType}-${fallback.message_fingerprint}.${getExtensionFromMimeType(mimeType)}`;

  return {
    message_type: messageType,
    mime_type: mimeType,
    file_name: fileName,
    occurred_at: media.occurred_at || fallback.occurred_at,
    direction: media.direction || fallback.direction,
    body: media.body || fallback.body,
    message_fingerprint: media.message_fingerprint || fallback.message_fingerprint,
    bytes: await resolveUploadBinary(media),
    transcription_enabled: typeof media.transcription_enabled === "boolean" ? media.transcription_enabled : true,
  };
}

async function collectMediaItems(payload, records, chatKey) {
  const mediaItems = [];
  for (const topLevelItem of asArray(payload.media)) {
    const fallbackRecord = records.find((record) => record.message_fingerprint === topLevelItem?.message_fingerprint) || {
      message_type: guessMessageType(topLevelItem),
      occurred_at: parseOccurredAt(topLevelItem?.occurred_at, payload.occurred_at),
      direction: inferDirection(topLevelItem?.sender_name, payload, topLevelItem?.direction),
      body: buildMessageBody(topLevelItem, guessMessageType(topLevelItem), topLevelItem?.direction),
      message_fingerprint: topLevelItem?.message_fingerprint || await hashText([
        chatKey,
        topLevelItem?.file_name || topLevelItem?.filename || "media",
        topLevelItem?.occurred_at || payload.occurred_at || "",
        topLevelItem?.mime_type || topLevelItem?.mimeType || "",
      ].join("|")),
    };
    const normalized = await normalizeMediaItem(topLevelItem, fallbackRecord);
    if (normalized) mediaItems.push(normalized);
  }

  for (const record of records) {
    for (const attachment of asArray(record.media)) {
      const normalized = await normalizeMediaItem(attachment, record);
      if (normalized) mediaItems.push(normalized);
    }
  }

  return mediaItems;
}

async function uploadMediaAsset(_session, media, payload, settings) {
  const bucket = media.bucket || payload.media_bucket || settings.mediaBucket;
  const dateKey = String(media.occurred_at || nowIso()).slice(0, 10);
  const extension = getExtensionFromMimeType(media.mime_type);
  const objectPath = [sanitizePathSegment(payload.chat_key), dateKey, sanitizePathSegment(media.message_type), `${media.message_fingerprint}.${extension}`].join("/");

  await requestSupabase(`/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath}`, {
    method: "POST",
    headers: { "Content-Type": media.mime_type, "x-upsert": "true" },
    body: media.bytes,
    expect: "json",
    keepalive: true,
  });

  return {
    bucket,
    path: objectPath,
    mime_type: media.mime_type,
    message_fingerprint: media.message_fingerprint,
    message_type: media.message_type,
    occurred_at: media.occurred_at,
    direction: media.direction,
    body: media.body,
    file_name: media.file_name,
  };
}

function isAnalysisEnabled(payload, settings) {
  if (typeof payload.analysis_enabled === "boolean") return payload.analysis_enabled;
  if (typeof payload.ai_enabled === "boolean") return payload.ai_enabled;
  return Boolean(settings.analysisEnabled);
}

function isTranscriptionEnabled(payload, settings, media) {
  if (typeof media?.transcription_enabled === "boolean") return media.transcription_enabled;
  if (typeof payload.transcription_enabled === "boolean") return payload.transcription_enabled;
  return Boolean(settings.transcriptionEnabled);
}

function fireConversationAnalysis(session, conversationId, payload, settings) {
  if (!isAnalysisEnabled(payload, settings)) return Promise.resolve({ skipped: true });
  const functionName = settings.analysisFunction || DEFAULT_ANALYSIS_FUNCTION;
  if (isEdgeFunctionUnavailable(functionName)) {
    markAsyncMetricFinish("analysis", "unavailable", `funcao ${functionName} indisponivel`, null).catch(() => null);
    return Promise.resolve({ skipped: true, unavailable: true });
  }
  markAsyncMetricStart("analysis", `disparado:${payload.chat_key}`).catch(() => null);

  return fireEdgeFunction(functionName, session, {
    conversation_id: conversationId,
    raw_text: payload.raw_text,
    company_name: payload.company_name || null,
    contact_name: payload.contact_name || null,
    cadence_day: payload.cadence_day || null,
    persona_type: payload.persona_type || null,
    chat_key: payload.chat_key,
    company_id: payload.company_id || null,
    contact_id: payload.contact_id || null,
  })
    .then((result) => {
      markAsyncMetricFinish("analysis", "success", `ok:${payload.chat_key}`, null).catch(() => null);
      return result;
    })
    .catch((error) => {
      console.warn("[Pipa] AI analysis failed:", error);
      const status = error?.unavailable ? "unavailable" : "failure";
      const details = error?.unavailable ? `funcao ${functionName} indisponivel` : `falha:${payload.chat_key}`;
      markAsyncMetricFinish("analysis", status, details, error).catch(() => null);
      return null;
    });
}

function fireAudioTranscription(session, media, payload, settings) {
  if (media.message_type !== "audio") return Promise.resolve({ skipped: true });
  if (!isTranscriptionEnabled(payload, settings, media)) return Promise.resolve({ skipped: true });

  const functionName = settings.transcriptionFunction || DEFAULT_TRANSCRIPTION_FUNCTION;
  if (isEdgeFunctionUnavailable(functionName)) {
    markAsyncMetricFinish("transcription", "unavailable", `funcao ${functionName} indisponivel`, null).catch(() => null);
    return Promise.resolve({ skipped: true, unavailable: true });
  }
  markAsyncMetricStart("transcription", `disparado:${media.path}`).catch(() => null);

  return fireEdgeFunction(functionName, session, {
    bucket: media.bucket,
    path: media.path,
    mime_type: media.mime_type,
    file_name: media.file_name,
    chat_key: payload.chat_key,
    company_id: payload.company_id || null,
    contact_id: payload.contact_id || null,
    message_fingerprint: media.message_fingerprint,
    message_type: media.message_type,
    occurred_at: media.occurred_at,
    direction: media.direction,
    body: media.body,
  })
    .then((result) => {
      markAsyncMetricFinish("transcription", "success", `ok:${media.path}`, null).catch(() => null);
      return result;
    })
    .catch((error) => {
      console.warn("[Pipa] Audio transcription failed:", error);
      const status = error?.unavailable ? "unavailable" : "failure";
      const details = error?.unavailable ? `funcao ${functionName} indisponivel` : `falha:${media.path}`;
      markAsyncMetricFinish("transcription", status, details, error).catch(() => null);
      return null;
    });
}

async function processMediaPipeline(session, payload, settings, records) {
  const mediaItems = await collectMediaItems(payload, records, payload.chat_key);
  if (!mediaItems.length) return { total: 0, uploaded: 0 };

  const uploaded = await Promise.allSettled(
    mediaItems.map(async (media) => {
      await markAsyncMetricStart("uploads", `subindo:${media.file_name}`);
      try {
        const uploadedMedia = await uploadMediaAsset(session, media, payload, settings);
        await markAsyncMetricFinish("uploads", "success", `ok:${uploadedMedia.path}`, null);
        void fireAudioTranscription(session, uploadedMedia, payload, settings);
        return uploadedMedia;
      } catch (error) {
        await markAsyncMetricFinish("uploads", "failure", `falha:${media.file_name}`, error);
        throw error;
      }
    })
  );

  return {
    total: mediaItems.length,
    uploaded: uploaded.filter((result) => result.status === "fulfilled").length,
  };
}
async function runPostSavePipeline(session, payload, conversationId, settings, options = {}) {
  const messageLabel = `${payload.chat_key}:${payload.message_count || countMessages(payload.raw_text)}`;
  await markAsyncMetricStart("message_sync", `sync:${messageLabel}`);

  try {
    const messageResult = await persistMessages(session, payload, payload.chat_key, settings);
    await markAsyncMetricFinish("message_sync", "success", `${messageResult.inserted}/${messageResult.total} novas`, null);
    void processMediaPipeline(session, payload, settings, messageResult.records || []).catch((error) => {
      console.warn("[Pipa] Media pipeline failed:", error);
    });
  } catch (error) {
    console.warn("[Pipa] Message sync failed:", error);
    await markAsyncMetricFinish("message_sync", "failure", `falha:${payload.chat_key}`, error);
  }

  if (options.includeAnalysis !== false) {
    void fireConversationAnalysis(session, conversationId, payload, settings);
  } else {
    await markAsyncMetricFinish("analysis", "skipped", `pulado:${payload.chat_key}`, null);
  }
}

async function saveConversation(payload) {
  const session = await getAuthorizedSession();
  if (!session) throw new Error("Nao autenticado");
  if (!payload?.raw_text?.trim()) throw new Error("Conversa vazia");

  const settings = await getExtensionSettings();
  const rawText = payload.raw_text.trim();
  const normalizedPhone = normalizePhone(payload.phone_number);
  const chatKey = payload.chat_key || normalizedPhone || slugify(payload.contact_name) || "chat";
  const contentHash = await hashText(rawText);
  const messageCount = payload.message_count || countMessages(rawText);
  const conversationRecordPayload = buildConversationRecordPayload(
    payload,
    rawText,
    normalizedPhone,
    chatKey,
    contentHash,
    messageCount
  );
  const conversationPayload = {
    ...payload,
    raw_text: rawText,
    chat_key: chatKey,
    phone_number: normalizedPhone,
    message_count: messageCount,
  };

  try {
    const existing = await supabaseFetch(
      `/rest/v1/whatsapp_conversations?select=id,created_at,content_hash,company_id,contact_id,company_name,contact_name,raw_text,phone_number,message_count,source,cadence_day,persona_type&chat_key=eq.${encodeURIComponent(chatKey)}&limit=1`
    );
    const existingConversation = existing?.[0] || null;
    let conversation = existingConversation;
    let duplicate = false;
    let shouldRunPipeline = false;
    let summary = "conversa sincronizada";

    if (!existingConversation) {
      const conversations = await supabaseFetch("/rest/v1/whatsapp_conversations", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        json: {
          ...conversationRecordPayload,
          created_by: session.user.id,
        },
      });

      conversation = conversations?.[0];
      if (!conversation) throw new Error("Falha ao salvar conversa");
      shouldRunPipeline = true;
      summary = "novo chat salvo";
    } else {
      duplicate = existingConversation.content_hash === contentHash;
      const fieldsToUpdate = duplicate
        ? {
            company_id: conversationRecordPayload.company_id,
            contact_id: conversationRecordPayload.contact_id,
            company_name: conversationRecordPayload.company_name,
            contact_name: conversationRecordPayload.contact_name,
            phone_number: conversationRecordPayload.phone_number,
            cadence_day: conversationRecordPayload.cadence_day,
            persona_type: conversationRecordPayload.persona_type,
          }
        : conversationRecordPayload;
      const patch = buildChangedFields(existingConversation, fieldsToUpdate);

      if (Object.keys(patch).length) {
        const updated = await supabaseFetch(`/rest/v1/whatsapp_conversations?id=eq.${encodeURIComponent(existingConversation.id)}`, {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          json: patch,
        });
        conversation = updated?.[0] || { ...existingConversation, ...patch };
      }

      if (duplicate) {
        summary = Object.keys(patch).length ? "duplicado com vinculo atualizado" : "duplicado";
        shouldRunPipeline = Array.isArray(payload.messages) && payload.messages.length > 0;
      } else {
        shouldRunPipeline = true;
        summary = "chat atualizado";
      }
    }

    await markSaveMetric("success", {
      duplicate,
      chatKey,
      conversationId: conversation.id,
      messageCount,
      summary,
    });

    if (shouldRunPipeline) {
      void runPostSavePipeline(session, conversationPayload, conversation.id, settings, {
        includeAnalysis: !duplicate,
      }).catch((error) => {
        console.warn("[Pipa] Background pipeline failed:", error);
      });
    }

    return {
      ...conversation,
      duplicate,
      chat_key: chatKey,
      content_hash: contentHash,
      message_count: messageCount,
      queued_operations: {
        message_sync: shouldRunPipeline ? messageCount : 0,
        upload: shouldRunPipeline ? asArray(payload.media).length : 0,
        analysis:
          shouldRunPipeline &&
          !duplicate &&
          isAnalysisEnabled(payload, settings) &&
          !isEdgeFunctionUnavailable(settings.analysisFunction || DEFAULT_ANALYSIS_FUNCTION),
        transcription:
          shouldRunPipeline &&
          Boolean(asArray(payload.media).length) &&
          isTranscriptionEnabled(payload, settings) &&
          !isEdgeFunctionUnavailable(settings.transcriptionFunction || DEFAULT_TRANSCRIPTION_FUNCTION),
      },
    };
  } catch (error) {
    await markSaveMetric("failure", {
      duplicate: false,
      chatKey,
      messageCount,
      error,
      summary: "falha no save",
    });
    throw error;
  }
}

async function linkConversation(conversationId, companyId, contactId) {
  const update = {
    company_id: companyId ?? null,
    contact_id: contactId ?? null,
  };
  return supabaseFetch(`/rest/v1/whatsapp_conversations?id=eq.${conversationId}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    json: update,
  });
}

async function analyzeQuick(rawText, contactName) {
  const session = await getAuthorizedSession();
  const settings = await getExtensionSettings();
  if (!session) throw new Error("Nao autenticado");
  return fireEdgeFunction(settings.analysisFunction || DEFAULT_ANALYSIS_FUNCTION, session, {
    raw_text: rawText,
    contact_name: contactName || null,
  });
}

async function getHistory(companyId) {
  return supabaseFetch(`/rest/v1/whatsapp_conversations?company_id=eq.${companyId}&select=id,summary,sentiment,interest_level,signal_recommendation,analyzed,created_at&order=created_at.desc&limit=20`);
}

async function getTasks() {
  const today = getTodayKey();
  return supabaseFetch(`/rest/v1/daily_tasks?status=eq.pending&due_date=lte.${today}&select=id,company_id,contact_id,task_type,persona_type,cadence_day,block_number,generated_message,urgency,due_date,status,companies(name,buying_signal)&order=urgency.desc,due_date.asc`);
}

async function completeTask(taskId) {
  return supabaseFetch(`/rest/v1/daily_tasks?id=eq.${taskId}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    json: { status: "done", done_at: nowIso() },
  });
}

async function skipTask(taskId) {
  return supabaseFetch(`/rest/v1/daily_tasks?id=eq.${taskId}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    json: { status: "skipped" },
  });
}

async function getWhatsAppTabStatus() {
  if (!chrome.tabs?.query) return { open: false, count: 0 };
  try {
    const tabs = await chrome.tabs.query({ url: ["https://web.whatsapp.com/*"] });
    return { open: tabs.length > 0, count: tabs.length, tab: tabs[0] || null };
  } catch (error) {
    console.warn("[Pipa] Tabs query failed:", error);
    return { open: false, count: 0 };
  }
}

function ensureAutomationAlarm() {
  if (!chrome.alarms?.create) return;
  chrome.alarms.create(AUTOMATION_ALARM, { periodInMinutes: AUTOMATION_PERIOD_MINUTES });
}

function getTodayRangeIso() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function getContactPhone(contact) {
  return normalizePhone(contact?.whatsapp || contact?.phone);
}

function isRecoverableSendError(error) {
  const text = String(error?.message || error || "").toLowerCase();
  return (
    text.includes("manual_input_active") ||
    text.includes("rate_limited") ||
    text.includes("whatsapp web nao esta aberto") ||
    text.includes("whatsapp web não está aberto") ||
    text.includes("could not establish connection") ||
    text.includes("receiving end does not exist") ||
    text.includes("message channel closed")
  );
}

async function getNextSendAllowedAt() {
  const runtime = await getAutomationRuntime();
  const next = runtime.next_send_allowed_at ? new Date(runtime.next_send_allowed_at).getTime() : 0;
  return Number.isFinite(next) ? next : 0;
}

async function canSendAutomationNow() {
  const next = await getNextSendAllowedAt();
  return !next || Date.now() >= next;
}

async function recordAutomationSend() {
  const now = Date.now();
  return updateAutomationRuntime({
    last_send_at: new Date(now).toISOString(),
    next_send_allowed_at: new Date(now + AUTOMATION_SEND_INTERVAL_MS).toISOString(),
  });
}

async function sendWhatsAppAutomationMessage({ chatKey, phoneNumber, contactName, message }) {
  if (!message?.trim()) throw new Error("Mensagem automatica vazia");
  if (!(await canSendAutomationNow())) throw new Error("rate_limited");

  const whatsapp = await getWhatsAppTabStatus();
  if (!whatsapp.open || !whatsapp.tab?.id) throw new Error("WhatsApp Web nao esta aberto");

  const response = await chrome.tabs.sendMessage(whatsapp.tab.id, {
    type: "PIPA_SEND_WHATSAPP_MESSAGE",
    payload: {
      chatKey,
      phoneNumber,
      contactName,
      message,
    },
  }).catch((error) => ({ ok: false, error: error?.message || String(error) }));

  if (!response?.ok) throw new Error(response?.error || "Falha ao enviar pelo WhatsApp Web");
  await recordAutomationSend();
  return response.raw_id || `automation:${Date.now()}`;
}

async function persistAutomationOutboundMessage(session, settings, payload) {
  const chatKey = payload.chat_key || (payload.phone_number ? `wa:${payload.phone_number}` : null);
  if (!chatKey || !payload.message?.trim()) return null;
  const occurredAt = nowIso();
  return persistMessages(session, {
    chat_key: chatKey,
    company_id: payload.company_id || null,
    contact_id: payload.contact_id || null,
    contact_name: payload.contact_name || "Contato",
    phone_number: payload.phone_number || null,
    raw_text: `[${occurredAt}] ${session.profile?.name || "Eu"}: ${payload.message}`,
    message_count: 1,
    messages: [
      {
        sender: session.profile?.name || "Eu",
        sender_name: session.profile?.name || "Eu",
        direction: "outbound",
        body: payload.message,
        raw_source: payload.message,
        source: payload.message,
        stamp: occurredAt,
        occurred_at: occurredAt,
        message_type: "text",
        external_id: payload.external_id || `automation:${occurredAt}:${chatKey}`,
        message_fingerprint_source: `${chatKey}|${payload.source || "automation"}|${payload.external_id || occurredAt}|${payload.message}`,
        media: [],
      },
    ],
  }, chatKey, settings);
}

async function processCadenceAutomation(session, settings) {
  if (!settings.cadenceAutomationEnabled) {
    await updateAutomationRuntime({ cadence_last_status: "disabled", cadence_last_at: nowIso(), cadence_last_error: null });
    return { sent: false, reason: "disabled" };
  }
  if (!(await canSendAutomationNow())) {
    await updateAutomationRuntime({ cadence_last_status: "rate_limited", cadence_last_at: nowIso(), cadence_last_error: null });
    return { sent: false, reason: "rate_limited" };
  }

  const rows = await supabaseFetch(
    `/rest/v1/cadence_tracks?status=eq.pending&scheduled_for=lte.${encodeURIComponent(nowIso())}&select=id,company_id,contact_id,persona_type,cadence_day,block_number,channel,status,scheduled_for,message_sent,contacts(id,name,whatsapp,phone),companies(id,name,objective)&order=scheduled_for.asc&limit=10`
  );
  const track = (rows || []).find((row) => row?.message_sent && getContactPhone(row.contacts));
  if (!track) {
    await updateAutomationRuntime({ cadence_last_status: "idle", cadence_last_at: nowIso(), cadence_last_error: null });
    return { sent: false, reason: "empty" };
  }

  const phoneNumber = getContactPhone(track.contacts);
  const chatKey = `wa:${phoneNumber}`;
  try {
    const rawId = await sendWhatsAppAutomationMessage({
      chatKey,
      phoneNumber,
      contactName: track.contacts?.name || null,
      message: track.message_sent,
    });

    await supabaseFetch(`/rest/v1/cadence_tracks?id=eq.${encodeURIComponent(track.id)}&status=eq.pending`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      json: { status: "sent", completed_at: nowIso() },
      keepalive: true,
    });

    await persistAutomationOutboundMessage(session, settings, {
      chat_key: chatKey,
      phone_number: phoneNumber,
      company_id: track.company_id,
      contact_id: track.contact_id,
      contact_name: track.contacts?.name || null,
      message: track.message_sent,
      source: "cadence",
      external_id: rawId,
    });

    await updateAutomationRuntime({ cadence_last_status: "sent", cadence_last_at: nowIso(), cadence_last_error: null });
    return { sent: true, trackId: track.id };
  } catch (error) {
    await updateAutomationRuntime({
      cadence_last_status: isRecoverableSendError(error) ? "waiting" : "failed",
      cadence_last_at: nowIso(),
      cadence_last_error: error?.message || String(error),
    });
    console.warn("[Pipa] Cadence automation skipped:", error);
    return { sent: false, error };
  }
}

async function processAutoReplyAutomation(session, settings) {
  if (!settings.autoReplyEnabled) {
    await updateAutomationRuntime({ auto_reply_last_status: "disabled", auto_reply_last_at: nowIso(), auto_reply_last_error: null });
    return { sent: false, reason: "disabled" };
  }
  if (!(await canSendAutomationNow())) {
    await updateAutomationRuntime({ auto_reply_last_status: "rate_limited", auto_reply_last_at: nowIso(), auto_reply_last_error: null });
    return { sent: false, reason: "rate_limited" };
  }

  const rows = await supabaseFetch(
    `/rest/v1/auto_reply_queue?status=eq.waiting&trigger_at=lte.${encodeURIComponent(nowIso())}&select=id,company_id,contact_id,chat_key,trigger_at,generated_message,contacts(id,name,whatsapp,phone),companies(id,name,objective)&order=trigger_at.asc&limit=1`
  );
  const queueItem = rows?.[0];
  if (!queueItem) {
    await updateAutomationRuntime({ auto_reply_last_status: "idle", auto_reply_last_at: nowIso(), auto_reply_last_error: null });
    return { sent: false, reason: "empty" };
  }

  await supabaseFetch(`/rest/v1/auto_reply_queue?id=eq.${encodeURIComponent(queueItem.id)}&status=eq.waiting`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    json: { status: "generating" },
    keepalive: true,
  });

  try {
    const result = await fireEdgeFunction(settings.autoReplyFunction || DEFAULT_AUTO_REPLY_FUNCTION, session, {
      auto_reply_queue_id: queueItem.id,
    });
    const generatedMessage = String(result?.generated_message || result?.message || queueItem.generated_message || "").trim();
    if (!generatedMessage) throw new Error("Edge Function nao retornou generated_message");

    const phoneNumber = getContactPhone(queueItem.contacts);
    const rawId = await sendWhatsAppAutomationMessage({
      chatKey: queueItem.chat_key,
      phoneNumber,
      contactName: queueItem.contacts?.name || null,
      message: generatedMessage,
    });

    await persistAutomationOutboundMessage(session, settings, {
      chat_key: queueItem.chat_key,
      phone_number: phoneNumber,
      company_id: queueItem.company_id,
      contact_id: queueItem.contact_id,
      contact_name: queueItem.contacts?.name || null,
      message: generatedMessage,
      source: "auto_reply",
      external_id: rawId,
    });

    await supabaseFetch(`/rest/v1/auto_reply_queue?id=eq.${encodeURIComponent(queueItem.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      json: {
        status: "sent",
        generated_message: generatedMessage,
        message_sent: generatedMessage,
        processed_at: nowIso(),
        error: null,
      },
      keepalive: true,
    });

    await updateAutomationRuntime({ auto_reply_last_status: "sent", auto_reply_last_at: nowIso(), auto_reply_last_error: null });
    return { sent: true, queueId: queueItem.id };
  } catch (error) {
    const recoverable = isRecoverableSendError(error);
    await supabaseFetch(`/rest/v1/auto_reply_queue?id=eq.${encodeURIComponent(queueItem.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      json: {
        status: recoverable ? "waiting" : "failed",
        error: error?.message || String(error),
        processed_at: recoverable ? null : nowIso(),
      },
      keepalive: true,
    });
    await updateAutomationRuntime({
      auto_reply_last_status: recoverable ? "waiting" : "failed",
      auto_reply_last_at: nowIso(),
      auto_reply_last_error: error?.message || String(error),
    });
    console.warn("[Pipa] Auto-reply automation skipped:", error);
    return { sent: false, error };
  }
}

let automationTickRunning = false;

async function runAutomationTick() {
  if (automationTickRunning) return;
  automationTickRunning = true;
  try {
    const session = await getAuthorizedSession();
    if (!session) return;
    const settings = await getExtensionSettings();
    await processAutoReplyAutomation(session, settings);
    await processCadenceAutomation(session, settings);
  } catch (error) {
    console.warn("[Pipa] Automation tick failed:", error);
  } finally {
    automationTickRunning = false;
  }
}

async function fetchAutomationStats(settings, runtime) {
  const { start, end } = getTodayRangeIso();
  const fallback = {
    cadence_enabled: Boolean(settings.cadenceAutomationEnabled),
    auto_reply_enabled: Boolean(settings.autoReplyEnabled),
    cadence_scheduled_today: 0,
    cadence_sent_today: 0,
    auto_reply_waiting: 0,
    auto_reply_sent_today: 0,
    next_send_allowed_at: runtime.next_send_allowed_at || null,
    cadence_last_status: runtime.cadence_last_status,
    cadence_last_error: runtime.cadence_last_error,
    auto_reply_last_status: runtime.auto_reply_last_status,
    auto_reply_last_error: runtime.auto_reply_last_error,
  };

  try {
    const [
      cadenceScheduled,
      cadenceSent,
      autoWaiting,
      autoSent,
    ] = await Promise.all([
      supabaseFetch(`/rest/v1/cadence_tracks?status=eq.pending&scheduled_for=gte.${encodeURIComponent(start)}&scheduled_for=lt.${encodeURIComponent(end)}&select=id&limit=1000`),
      supabaseFetch(`/rest/v1/cadence_tracks?status=eq.sent&completed_at=gte.${encodeURIComponent(start)}&select=id&limit=1000`),
      supabaseFetch("/rest/v1/auto_reply_queue?status=eq.waiting&select=id&limit=1000"),
      supabaseFetch(`/rest/v1/auto_reply_queue?status=eq.sent&processed_at=gte.${encodeURIComponent(start)}&select=id&limit=1000`),
    ]);

    return {
      ...fallback,
      cadence_scheduled_today: cadenceScheduled?.length || 0,
      cadence_sent_today: cadenceSent?.length || 0,
      auto_reply_waiting: autoWaiting?.length || 0,
      auto_reply_sent_today: autoSent?.length || 0,
    };
  } catch (error) {
    console.warn("[Pipa] Automation stats unavailable:", error);
    return fallback;
  }
}

async function getExtensionStats() {
  const trackedState = await chrome.storage.local.get(["pipa_tracked_chats", "pipa_tracked"]);
  const trackedChats = trackedState.pipa_tracked_chats || trackedState.pipa_tracked || {};
  const entries = Object.values(trackedChats).filter((item) => item && item.enabled);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [bridgeState, waBridge, automationRuntime, settings, whatsapp] = await Promise.all([
    getBridgeState(),
    getWaBridgeRuntime(),
    getAutomationRuntime(),
    getExtensionSettings(),
    getWhatsAppTabStatus(),
  ]);
  const automation = await fetchAutomationStats(settings, automationRuntime);

  const lastSyncAt = entries.reduce((latest, item) => {
    const current = Number(item?.lastSync || 0);
    return current > latest ? current : latest;
  }, 0);

  return {
    monitored_today: entries.filter((item) => Number(item?.lastSync || 0) >= startOfToday.getTime()).length,
    monitored_total: entries.length,
    monitored_names: entries.slice(0, 3).map((item) => item.displayName || item.chatKey),
    whatsapp_open: whatsapp.open,
    whatsapp_tabs: whatsapp.count,
    last_sync_at: lastSyncAt || null,
    pending_jobs: getPendingOperationsCount(bridgeState),
    saves: bridgeState.saves,
    message_sync: bridgeState.message_sync,
    uploads: bridgeState.uploads,
    analysis: bridgeState.analysis,
    transcription: bridgeState.transcription,
    wa_bridge: waBridge,
    automation,
    settings,
  };
}

chrome.runtime.onInstalled.addListener(() => {
  void ensureExtensionBootState();
  void runAutomationTick();
});

chrome.runtime.onStartup?.addListener(() => {
  void ensureExtensionBootState();
  void runAutomationTick();
});

void ensureExtensionBootState();

chrome.alarms?.onAlarm.addListener((alarm) => {
  if (alarm.name === AUTOMATION_ALARM) {
    void runAutomationTick();
  }
});

// ──────────────────────────────────────────────────────────
// Captura on-click (wa-js) → ingest via RPC
// ──────────────────────────────────────────────────────────

async function ingestCapturedChat({ chat, messages }) {
  if (!chat || !Array.isArray(messages)) {
    return { ok: false, error: "payload inválido" };
  }
  if (!chat.number_e164) {
    return { ok: false, error: "Número não identificado neste chat." };
  }

  try {
    const result = await supabaseFetch("/rest/v1/rpc/ingest_whatsapp_chat", {
      method: "POST",
      json: {
        p_chat: {
          chat_id: chat.chat_id,
          number_e164: chat.number_e164,
          display_name: chat.display_name,
          push_name: chat.push_name,
          profile_pic_url: chat.profile_pic_url,
        },
        p_messages: messages,
      },
    });

    const row = Array.isArray(result) ? result[0] : result;
    return {
      ok: true,
      contact_id: row?.contact_id ?? null,
      contact_created: !!row?.contact_created,
      messages_inserted: row?.messages_inserted ?? 0,
      messages_skipped: row?.messages_skipped ?? 0,
    };
  } catch (err) {
    console.error("[Pipa] ingest error:", err);
    return { ok: false, error: err?.message || String(err) };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handler = async () => {
    try {
      switch (msg.type) {
        case "LOGIN":
          return { ok: true, data: await login(msg.email, msg.password) };
        case "LOGOUT":
          await logout();
          return { ok: true };
        case "GET_SESSION":
          return { ok: true, data: await getAuthorizedSession() };
        case "GET_EXTENSION_SETTINGS":
          return { ok: true, data: await getExtensionSettings() };
        case "UPDATE_EXTENSION_SETTINGS":
          return { ok: true, data: await updateExtensionSettings(msg.patch) };
        case "REPORT_WA_BRIDGE_STATE":
          return { ok: true, data: await updateWaBridgeRuntime(msg.snapshot) };
        case "SEARCH_COMPANIES":
          return { ok: true, data: await searchCompanies(msg.query) };
        case "SEARCH_CONTACTS":
          return { ok: true, data: await searchContacts(msg.companyId, msg.query) };
        case "SAVE_CONVERSATION":
          return { ok: true, data: await saveConversation(msg.payload) };
        case "LINK_CONVERSATION":
          return { ok: true, data: await linkConversation(msg.conversationId, msg.companyId, msg.contactId) };
        case "ANALYZE_QUICK":
          return { ok: true, data: await analyzeQuick(msg.raw_text, msg.contact_name) };
        case "GET_HISTORY":
          return { ok: true, data: await getHistory(msg.companyId) };
        case "GET_EXTENSION_STATS":
          return { ok: true, data: await getExtensionStats() };
        case "GET_TASKS":
          return { ok: true, data: await getTasks() };
        case "COMPLETE_TASK":
          return { ok: true, data: await completeTask(msg.taskId) };
        case "SKIP_TASK":
          return { ok: true, data: await skipTask(msg.taskId) };
        case "MATCH_CONTACT":
          return { ok: true, data: await matchContact(msg.phone, msg.name) };
        case "CREATE_CONTACT":
          return { ok: true, data: await createContact(msg.companyId, msg.name, msg.phone) };
        case "PIPA_INGEST_CHAT":
          return await ingestCapturedChat(msg.payload);
        default:
          return { ok: false, error: `Unknown message type: ${msg.type}` };
      }
    } catch (error) {
      return { ok: false, error: error?.message || String(error) };
    }
  };

  handler().then(sendResponse);
  return true;
});
