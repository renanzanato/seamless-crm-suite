// ──────────────────────────────────────────────────────────
// Pipa Driven CRM Sync — MV3 Service Worker
// Integração nativa com Supabase do seamless-crm-suite:
//   • login por e-mail/senha via Auth v1
//   • lookup de contato via PostgREST (RLS por owner)
//   • captura de mensagens via RPC ingest_whatsapp_chat
// ──────────────────────────────────────────────────────────

const SUPABASE_URL = "https://dsvkoeomtnwccxxcwwga.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzdmtvZW9tdG53Y2N4eGN3d2dhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzOTkyOTIsImV4cCI6MjA5MDk3NTI5Mn0.lKYhSA9LO8Zpx8DANxj9lfa1CYeQBBCx7LBQC3sq1y8";

const STORAGE_KEYS = {
  session: "pipa_crm_session_v2",
  stats: "pipa_crm_stats_v1",
  contactCache: "pipa_crm_contact_cache_v1",
  uiLocalState: "pipa_ui_local_state_v1",
  settings: "pipa_crm_settings_v1",
};

const DEFAULT_SETTINGS = {
  auto_approve_new_contacts: false,
};

const CONTACT_CACHE_TTL_MS = 5 * 60 * 1000;
const CONTACT_CACHE_MAX_ROWS = 600;
const API_TIMEOUT_MS = 15000;

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

function createDefaultStats() {
  return {
    lookups: 0,
    eligible: 0,
    ignored: 0,
    synced: 0,
    failed: 0,
    last_status: "idle",
    last_error: null,
    last_phone: null,
    last_contact_name: null,
    last_sync_at: null,
    updated_at: null,
  };
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

function toE164(digits) {
  const clean = normalizePhone(digits);
  return clean ? `+${clean}` : "";
}

function toE164Variants(phone) {
  return buildPhoneVariants(phone).map((digits) => `+${digits}`);
}

function normalizeChatKey(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^(wa|phone|title|group):/i.test(text)) return text;
  if (/@(?:c\.us|s\.whatsapp\.net)$/i.test(text)) return `wa:${text}`;
  const phone = normalizePhone(text);
  return phone ? `phone:${phone}` : text;
}

function makeChatKey(chatId, phone) {
  return normalizeChatKey(chatId) || (phone ? `phone:${normalizePhone(phone)}` : "");
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function compactErrorDetail(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatSupabaseError(data, status) {
  const parts = [
    data?.message,
    data?.details,
    data?.hint,
    data?.code ? `code=${data.code}` : "",
    data?.error_description,
    data?.error,
    data?.msg,
  ].map(compactErrorDetail).filter(Boolean);

  return parts.length ? parts.join(" | ") : `Erro HTTP ${status}`;
}

async function supabaseFetch(path, options = {}) {
  const url = new URL(`${SUPABASE_URL}${path}`);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Accept: "application/json",
    ...(options.headers || {}),
  };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (options.prefer) headers.Prefer = options.prefer;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url.toString(), {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Tempo limite do Supabase excedido.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const data = await readJson(response);

  if (!response.ok) {
    const message = formatSupabaseError(data, response.status);
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

async function getSession() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.session);
  return result[STORAGE_KEYS.session] || null;
}

async function setSession(session) {
  await chrome.storage.local.set({ [STORAGE_KEYS.session]: session });
  return session;
}

async function clearSession() {
  await chrome.storage.local.remove([
    STORAGE_KEYS.session,
    STORAGE_KEYS.contactCache,
    STORAGE_KEYS.uiLocalState,
  ]);
}

async function getStats() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.stats);
  return { ...createDefaultStats(), ...(result[STORAGE_KEYS.stats] || {}) };
}

async function getSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.settings);
  return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.settings] || {}) };
}

async function patchSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...(patch || {}) };
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: next });
  return next;
}

async function patchStats(patch) {
  const current = await getStats();
  const next = {
    ...current,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  await chrome.storage.local.set({ [STORAGE_KEYS.stats]: next });
  return next;
}

async function getContactCache() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.contactCache);
  return result[STORAGE_KEYS.contactCache] || {};
}

function pruneContactCache(cache) {
  const now = Date.now();
  for (const [key, value] of Object.entries(cache)) {
    if (Number(value?.expires_at || 0) < now) delete cache[key];
  }

  const entries = Object.entries(cache);
  if (entries.length <= CONTACT_CACHE_MAX_ROWS) return;

  entries
    .sort((left, right) => Number(left[1]?.cached_at || 0) - Number(right[1]?.cached_at || 0))
    .slice(0, entries.length - CONTACT_CACHE_MAX_ROWS)
    .forEach(([key]) => delete cache[key]);
}

async function setCachedContact(phone, data) {
  const cache = await getContactCache();
  const row = {
    ...data,
    cached_at: Date.now(),
    expires_at: Date.now() + CONTACT_CACHE_TTL_MS,
  };
  for (const variant of new Set([phone, ...(data.phoneVariants || [])])) {
    if (variant) cache[variant] = row;
  }
  pruneContactCache(cache);
  await chrome.storage.local.set({ [STORAGE_KEYS.contactCache]: cache });
}

async function getCachedContact(phone) {
  const cache = await getContactCache();
  const cached = cache[phone];
  if (!cached) return null;
  if (Number(cached.expires_at || 0) < Date.now()) {
    delete cache[phone];
    await chrome.storage.local.set({ [STORAGE_KEYS.contactCache]: cache });
    return null;
  }
  return cached;
}

function sanitizeSession(session) {
  if (!session) return null;
  return {
    user: session.user || null,
    label: session.label || session.user?.email || null,
    created_at: session.created_at || null,
    expires_at: session.expires_at || null,
  };
}

// ── Auth ─────────────────────────────────────────────────

async function login(payload) {
  const email = String(payload.email || "").trim().toLowerCase();
  const password = String(payload.password || "");
  if (!email || !password) throw new Error("Informe e-mail e senha.");

  let data;
  try {
    data = await supabaseFetch("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: { email, password },
    });
  } catch (error) {
    if (error.status === 400 || error.status === 401) {
      throw new Error("E-mail ou senha inválidos.");
    }
    throw new Error(`Não foi possível logar no Supabase: ${error.message}`);
  }

  const session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Number(data.expires_at) || Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600),
    user: data.user ? { id: data.user.id, email: data.user.email || email } : { email },
    label: email,
    created_at: new Date().toISOString(),
  };

  await setSession(session);
  await patchStats({ last_status: "authenticated", last_error: null });
  return sanitizeSession(session);
}

async function refreshSession(session) {
  const data = await supabaseFetch("/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    body: { refresh_token: session.refresh_token },
  });
  const refreshed = {
    ...session,
    access_token: data.access_token,
    refresh_token: data.refresh_token || session.refresh_token,
    expires_at: Number(data.expires_at) || Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600),
    user: data.user ? { id: data.user.id, email: data.user.email || session.user?.email } : session.user,
  };
  await setSession(refreshed);
  return refreshed;
}

async function ensureSession() {
  const session = await getSession();
  if (!session) throw new Error("Extensão não autenticada.");
  const now = Math.floor(Date.now() / 1000);
  if (session.expires_at && session.expires_at - 60 <= now) {
    if (!session.refresh_token) {
      await clearSession();
      throw new Error("Sessão expirada. Faça login novamente.");
    }
    try {
      return await refreshSession(session);
    } catch (error) {
      await clearSession();
      throw new Error("Sessão expirada. Faça login novamente.");
    }
  }
  return session;
}

// ── Lookup ───────────────────────────────────────────────

async function findContactByWhatsappRpc(session, phone) {
  const candidates = new Set([
    toE164(phone),
    ...toE164Variants(phone),
    normalizePhone(phone),
    ...buildPhoneVariants(phone),
  ]);

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const data = await supabaseFetch("/rest/v1/rpc/find_contact_by_whatsapp", {
        method: "POST",
        token: session.access_token,
        body: { p_phone: candidate },
      });
      const row = Array.isArray(data) && data.length ? data[0] : null;
      if (row) return row;
    } catch (error) {
      // Bancos antigos podem nao ter essa RPC; o lookup REST abaixo cobre o fallback.
      if (error?.status === 404 || /find_contact_by_whatsapp|Could not find/i.test(error?.message || "")) return null;
      console.warn("[Pipa] find_contact_by_whatsapp falhou; tentando lookup REST:", error?.message);
      return null;
    }
  }

  return null;
}

async function queryContactByWhatsappExact(session, phone, select) {
  const e164List = toE164Variants(phone);
  return supabaseFetch("/rest/v1/contacts", {
    token: session.access_token,
    query: {
      select,
      whatsapp: `in.(${e164List.join(",")})`,
      limit: 1,
    },
  });
}

async function lookupContact(payload) {
  const session = await ensureSession();

  const phone = normalizePhone(payload.phone);
  if (!phone) throw new Error("Telefone não identificado.");
  if (phone.length < 10 || phone.length > 15) {
    throw new Error("Telefone fora do tamanho esperado (10–15 dígitos).");
  }

  const cached = await getCachedContact(phone);
  if (cached) return cached;

  await patchStats({
    lookups: (await getStats()).lookups + 1,
    last_status: "checking_contact",
    last_phone: phone,
    last_error: null,
  });

  let row = await findContactByWhatsappRpc(session, phone);
  if (!row) {
    let data;
    try {
      data = await queryContactByWhatsappExact(session, phone, "id,name,company_id,is_orphan,wa_push_name,whatsapp");
    } catch (error) {
      if (!/is_orphan|wa_push_name|column/i.test(error?.message || "")) throw error;
      data = await queryContactByWhatsappExact(session, phone, "id,name,company_id,whatsapp");
    }
    row = Array.isArray(data) && data.length ? data[0] : null;
  }

  const exists = Boolean(row);
  const relevant = Boolean(row);
  const shouldMonitor = exists && relevant;

  const normalized = {
    phone,
    phoneVariants: buildPhoneVariants(phone),
    exists,
    relevant,
    shouldMonitor,
    contactId: row?.id || null,
    companyId: row?.company_id || null,
    opportunityId: null,
    name: row?.name || row?.wa_push_name || null,
    isOrphan: row?.is_orphan || false,
    raw: row ? { contact: row } : null,
  };

  await setCachedContact(phone, normalized);

  const stats = await getStats();
  await patchStats({
    eligible: stats.eligible + (shouldMonitor ? 1 : 0),
    ignored: stats.ignored + (shouldMonitor ? 0 : 1),
    last_status: shouldMonitor ? "monitoring_contact" : "ignored_contact",
    last_phone: phone,
    last_contact_name: normalized.name,
    last_error: null,
  });

  return normalized;
}

async function markNotApproved(phone, contactName = null) {
  await patchStats({
    last_status: "ignored_contact",
    last_phone: phone,
    last_contact_name: contactName,
    last_error: "Contato nao aprovado para espelhamento. Crie/aprove o contato no CRM ou habilite auto-aprovacao na extensao.",
  });
}

// ── Approve (opt-in pelo WhatsApp) ───────────────────────

async function invalidateCachedContact(phone) {
  const variants = new Set([normalizePhone(phone), ...buildPhoneVariants(phone)]);
  const cache = await getContactCache();
  let changed = false;
  for (const variant of variants) {
    if (variant && cache[variant]) {
      delete cache[variant];
      changed = true;
    }
  }
  if (changed) await chrome.storage.local.set({ [STORAGE_KEYS.contactCache]: cache });
}

async function approveContact(payload) {
  const session = await ensureSession();

  const phone = normalizePhone(payload?.phone);
  if (!phone) throw new Error("Telefone não identificado.");
  if (phone.length < 10 || phone.length > 15) {
    throw new Error("Telefone fora do tamanho esperado (10–15 dígitos).");
  }

  const chatJid =
    payload?.chatId && /@/i.test(payload.chatId) ? payload.chatId : `${phone}@c.us`;
  if (/@g\.us/i.test(chatJid)) {
    throw new Error("Grupos não podem ser espelhados.");
  }

  const chatPayload = {
    chat_id: chatJid,
    chat_key: normalizeChatKey(payload?.chatKey) || makeChatKey(chatJid, phone),
    number_e164: toE164(phone),
    display_name: payload?.chatTitle || payload?.pushName || phone,
    push_name: payload?.pushName || null,
    profile_pic_url: null,
  };

  await supabaseFetch("/rest/v1/rpc/ingest_whatsapp_chat", {
    method: "POST",
    token: session.access_token,
    body: { p_chat: chatPayload, p_messages: [] },
  });

  await invalidateCachedContact(phone);

  const approved = await lookupContact({ phone });
  if (!approved?.shouldMonitor) {
    throw new Error("Contato aprovado, mas não ficou visível para o CRM. Tente novamente.");
  }

  await patchStats({
    last_status: "monitoring_contact",
    last_phone: phone,
    last_contact_name: approved.name || payload?.chatTitle || null,
    last_error: null,
  });

  return approved;
}

// ── Approved contact resolution (com auto-approve opcional) ──

async function lookupCacheForPhone(phone) {
  const direct = await getCachedContact(phone);
  if (direct) return direct;
  for (const variant of buildPhoneVariants(phone)) {
    const match = await getCachedContact(variant);
    if (match) return match;
  }
  return null;
}

async function ensureApprovedContact({ phone, chatId, chatTitle, pushName }) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  let contact = await lookupCacheForPhone(normalized);
  if (contact?.shouldMonitor) return contact;

  if (!contact) {
    try {
      contact = await lookupContact({ phone: normalized });
    } catch (error) {
      console.warn("[Pipa] lookup falhou em ensureApprovedContact:", error?.message);
    }
  }
  if (contact?.shouldMonitor) return contact;

  const settings = await getSettings();
  if (!settings.auto_approve_new_contacts) return null;

  try {
    const approved = await approveContact({
      phone: normalized,
      chatId: chatId || "",
      chatTitle: chatTitle || "",
      pushName: pushName || "",
    });
    if (approved?.shouldMonitor) return approved;
  } catch (error) {
    console.warn("[Pipa] auto-approve falhou:", error?.message);
  }
  return null;
}

// ── Sync ─────────────────────────────────────────────────

function normalizeFlatMessagePayload(payload) {
  return {
    phone: payload.phone || payload.contact_phone || "",
    chatId: payload.chatId || payload.chat_id || payload.chat?.id || "",
    chatKey: payload.chatKey || payload.chat_key || payload.chat?.key || "",
    chatTitle: payload.chatTitle || payload.chat_title || payload.chat?.title || "",
    message: {
      id: String(payload.raw_id || payload.id || payload.message_id || ""),
      direction: payload.direction || "unknown",
      author: payload.author || null,
      type: payload.type || "text",
      text: payload.content_md || payload.text || payload.body || "",
      rawTimestamp: payload.raw_timestamp || payload.rawTimestamp || null,
      timestamp: payload.timestamp_wa || payload.timestamp || new Date().toISOString(),
      chat_jid: payload.chat_jid || "",
    },
  };
}

function mapMessageToRpc(message, chatId, chatKey) {
  const providerMessageId = String(message?.id || message?.raw_id || "");
  const timestamp = message?.timestamp_wa || message?.timestamp || new Date().toISOString();
  const body = message?.text || message?.content_md || "";
  return {
    wa_msg_id: providerMessageId,
    provider_message_id: providerMessageId,
    chat_id: chatId,
    chat_key: chatKey,
    from_me: message?.direction === "out" || message?.from_me === true,
    author: message?.author || null,
    type: message?.type || "text",
    body,
    timestamp,
    has_media: message?.type === "audio" || message?.type === "media",
    quoted_msg_id: message?.quoted_msg_id || null,
  };
}

async function syncMessage(payload) {
  const session = await ensureSession();

  const flat = payload?.message ? payload : normalizeFlatMessagePayload(payload || {});
  const phone = normalizePhone(flat.phone);
  if (!phone) throw new Error("Mensagem sem telefone.");

  const rawMessage = flat.message || {};
  const text = String(rawMessage.text || rawMessage.content_md || "").trim();
  const type = rawMessage.type || "text";
  if (!text && type === "text") return { skipped: true, reason: "empty_text" };

  const chatJid =
    flat.chatId && /@/i.test(flat.chatId)
      ? flat.chatId
      : rawMessage.chat_jid || `${phone}@c.us`;
  if (/@g\.us/i.test(chatJid)) return { skipped: true, reason: "group" };
  const chatKey = normalizeChatKey(flat.chatKey) || makeChatKey(chatJid, phone);

  const approvedContact = await ensureApprovedContact({
    phone,
    chatId: chatJid,
    chatTitle: flat.chatTitle,
  });
  if (!approvedContact) {
    await markNotApproved(phone, flat.chatTitle || null);
    return { skipped: true, reason: "not_approved" };
  }

  const chatPayload = {
    chat_id: chatJid,
    chat_key: chatKey,
    number_e164: toE164(phone),
    display_name: flat.chatTitle || approvedContact.name || phone,
    push_name: approvedContact.name || null,
    profile_pic_url: null,
  };
  const messagesPayload = [mapMessageToRpc(rawMessage, chatJid, chatKey)];

  try {
    const data = await supabaseFetch("/rest/v1/rpc/ingest_whatsapp_chat", {
      method: "POST",
      token: session.access_token,
      body: { p_chat: chatPayload, p_messages: messagesPayload },
    });

    const row = Array.isArray(data) ? data[0] : data;
    const inserted = Number(row?.messages_inserted || 0);
    const skipped = Number(row?.messages_skipped || 0);

    if (inserted > 0) {
      const stats = await getStats();
      await patchStats({
        synced: stats.synced + inserted,
        last_status: "message_synced",
        last_error: null,
        last_phone: phone,
        last_contact_name: approvedContact.name,
        last_sync_at: new Date().toISOString(),
      });
      return { synced: true, data: row };
    }

    return { synced: false, duplicate: skipped > 0, data: row };
  } catch (error) {
    const stats = await getStats();
    await patchStats({
      failed: stats.failed + 1,
      last_status: "sync_failed",
      last_error: error.message,
      last_phone: phone,
    });
    throw error;
  }
}

async function backfillChat(payload) {
  const session = await ensureSession();

  const phone = normalizePhone(payload?.phone);
  if (!phone) throw new Error("Telefone ausente no backfill.");

  const chatJid =
    payload?.chatId && /@/i.test(payload.chatId) ? payload.chatId : `${phone}@c.us`;
  if (/@g\.us/i.test(chatJid)) {
    return { skipped: true, reason: "group" };
  }
  const chatKey = normalizeChatKey(payload?.chatKey) || makeChatKey(chatJid, phone);

  const approvedContact = await ensureApprovedContact({
    phone,
    chatId: chatJid,
    chatTitle: payload?.chatTitle,
  });
  if (!approvedContact) {
    await markNotApproved(phone, payload?.chatTitle || null);
    return { skipped: true, reason: "not_approved" };
  }

  const incoming = Array.isArray(payload?.messages) ? payload.messages : [];
  if (!incoming.length) {
    return { synced: true, inserted: 0, skipped: 0 };
  }

  const chatPayload = {
    chat_id: chatJid,
    chat_key: chatKey,
    number_e164: toE164(phone),
    display_name: payload?.chatTitle || approvedContact.name || phone,
    push_name: approvedContact.name || null,
    profile_pic_url: null,
  };

  const CHUNK_SIZE = 200;
  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < incoming.length; i += CHUNK_SIZE) {
    const chunk = incoming
      .slice(i, i + CHUNK_SIZE)
      .map((message) => mapMessageToRpc(message, chatJid, chatKey));

    const data = await supabaseFetch("/rest/v1/rpc/ingest_whatsapp_chat", {
      method: "POST",
      token: session.access_token,
      body: { p_chat: chatPayload, p_messages: chunk },
    });

    const row = Array.isArray(data) ? data[0] : data;
    inserted += Number(row?.messages_inserted || 0);
    skipped += Number(row?.messages_skipped || 0);
  }

  const stats = await getStats();
  await patchStats({
    synced: stats.synced + inserted,
    last_status: inserted > 0 ? "message_synced" : "backfill_no_new",
    last_error: null,
    last_phone: phone,
    last_contact_name: approvedContact.name,
    last_sync_at: new Date().toISOString(),
  });

  return { synced: true, inserted, skipped };
}

// ── Status & router ──────────────────────────────────────

async function getRuntimeStatus() {
  const [rawSession, stats, settings] = await Promise.all([
    getSession(),
    getStats(),
    getSettings(),
  ]);
  return {
    authenticated: Boolean(rawSession),
    session: sanitizeSession(rawSession),
    stats,
    settings,
    api_contract: {
      auth: `POST ${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      contact_lookup: `GET ${SUPABASE_URL}/rest/v1/contacts?whatsapp=in.(+55...)`,
      message_sync: `POST ${SUPABASE_URL}/rest/v1/rpc/ingest_whatsapp_chat`,
    },
  };
}

chrome.runtime.onInstalled.addListener(() => {
  void patchStats({ last_status: "installed" });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const run = async () => {
    try {
      switch (message?.type) {
        case "CRM_GET_STATUS":
          return { ok: true, data: await getRuntimeStatus() };
        case "CRM_GET_SESSION":
          return { ok: true, data: sanitizeSession(await getSession()) };
        case "CRM_LOGIN":
          return { ok: true, data: await login(message.payload || {}) };
        case "CRM_LOGOUT":
          await clearSession();
          await patchStats({ last_status: "logged_out", last_error: null });
          return { ok: true };
        case "CRM_LOOKUP_CONTACT":
          return { ok: true, data: await lookupContact(message.payload || {}) };
        case "CRM_APPROVE_CONTACT":
          return { ok: true, data: await approveContact(message.payload || {}) };
        case "CRM_SYNC_MESSAGE":
        case "NEW_MESSAGE":
          return { ok: true, data: await syncMessage(message.payload || {}) };
        case "BACKFILL_CHAT":
          return { ok: true, data: await backfillChat(message.payload || {}) };
        case "CRM_GET_SETTINGS":
          return { ok: true, data: await getSettings() };
        case "CRM_UPDATE_SETTINGS":
          return { ok: true, data: await patchSettings(message.payload || {}) };
        default:
          return { ok: false, error: `Tipo de mensagem desconhecido: ${message?.type}` };
      }
    } catch (error) {
      return { ok: false, error: error?.message || String(error), status: error?.status || null };
    }
  };

  run().then(sendResponse);
  return true;
});
