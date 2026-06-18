function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return undefined;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function encodeBase64UrlJson(value) {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function parseJwtPayload(token) {
  if (typeof token !== "string" || token.trim() === "") {
    return undefined;
  }

  const segments = token.split(".");
  if (segments.length < 2) {
    return undefined;
  }

  try {
    return JSON.parse(decodeBase64Url(segments[1]));
  } catch {
    return undefined;
  }
}

function getOpenAIAuthSection(payload) {
  if (!isPlainObject(payload)) {
    return {};
  }

  const auth = payload["https://api.openai.com/auth"];
  return isPlainObject(auth) ? auth : {};
}

function getOpenAIProfileSection(payload) {
  if (!isPlainObject(payload)) {
    return {};
  }

  const profile = payload["https://api.openai.com/profile"];
  return isPlainObject(profile) ? profile : {};
}

function normalizeTimestamp(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value > 1e11 ? value : value * 1000;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function timestampFromUnixSeconds(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }

  const date = new Date(numeric * 1000);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function unixSecondsFromJwtExp(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return undefined;
  }

  return Math.trunc(numeric);
}

function epochSecondsFromValue(value) {
  if (value === undefined || value === null || value === "") {
    return 0;
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return Math.trunc(numeric > 1e11 ? numeric / 1000 : numeric);
  }

  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? Math.trunc(parsed / 1000) : 0;
}

function buildSyntheticCodexIdToken(email, accountId, planType, userId, expiresAt) {
  if (!accountId) {
    return undefined;
  }

  const now = Math.trunc(Date.now() / 1000);
  const authInfo = { chatgpt_account_id: accountId };
  const expires = epochSecondsFromValue(expiresAt) || now + 90 * 24 * 60 * 60;

  if (planType) {
    authInfo.chatgpt_plan_type = planType;
  }

  if (userId) {
    authInfo.chatgpt_user_id = userId;
    authInfo.user_id = userId;
  }

  const payload = {
    iat: now,
    exp: expires,
    "https://api.openai.com/auth": authInfo,
  };

  if (email) {
    payload.email = email;
  }

  return `${encodeBase64UrlJson({ alg: "none", typ: "JWT", cpa_synthetic: true })}.${encodeBase64UrlJson(payload)}.synthetic`;
}

function getExpiresIn(expiresAt, now = new Date()) {
  if (!expiresAt) {
    return undefined;
  }

  const expiresMs = new Date(expiresAt).getTime();
  if (Number.isNaN(expiresMs)) {
    return undefined;
  }

  return Math.max(0, Math.floor((expiresMs - now.getTime()) / 1000));
}

function getAxonHubLastRefresh(expiresAt, now = new Date()) {
  const expiresMs = expiresAt ? new Date(expiresAt).getTime() : NaN;
  if (Number.isNaN(expiresMs)) {
    return normalizeTimestamp(now);
  }

  return new Date(expiresMs - 60 * 60 * 1000).toISOString();
}

function stripUnavailable(value) {
  if (Array.isArray(value)) {
    return value.map(stripUnavailable).filter((item) => item !== undefined);
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value)
      .map(([key, item]) => [key, stripUnavailable(item)])
      .filter(([, item]) => item !== undefined);
    return entries.length ? Object.fromEntries(entries) : undefined;
  }

  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return value;
}

function toEmailKey(email) {
  if (typeof email !== "string") {
    return undefined;
  }

  return email
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function sanitizeFileToken(value, fallback = "chatgpt-session") {
  const base = firstNonEmpty(value, fallback) || fallback;
  return base
    .replace(/\.[^.]+$/u, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80) || fallback;
}

function getTimestampToken(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + "_" + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("-");
}

function formatDisplayDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const pad = (item) => String(item).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
