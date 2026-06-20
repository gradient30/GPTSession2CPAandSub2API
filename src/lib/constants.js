const OUTPUT_LABELS = {
  sub2api: "sub2api",
  cpa: "CPA",
  cockpit: "Cockpit",
  "9router": "9router",
  codex: "Codex",
  axonhub: "AxonHub",
  codexmanager: "Codex-Manager",
};

const SOURCE_LABELS = {
  "pasted-json": "粘贴 JSON",
};

const DEFAULT_ACCOUNT_NAME = "ChatGPT 账号";
const CODEX_MANAGER_IMPORT_NOTE = "从 ChatGPT 会话导入";
const AXONHUB_PLACEHOLDER_NOTE = "refresh_token 为占位值；access_token 过期前可用，过期后无法自动刷新。";

const AXONHUB_PLACEHOLDER_REFRESH_TOKEN = "__missing_refresh_token__";
const SENSITIVE_SKIP_KEY = "gpt-session-converter-sensitive-skip";
const CHATGPT_SESSION_URL = "https://chatgpt.com/api/auth/session";
const SESSION_FETCH_TIMEOUT_MS = 20000;
const SESSION_FETCH_MIN_WAIT_MS = 3500;
const SESSION_FALLBACK_OPEN_DELAY_MS = 800;
const SESSION_FETCH_RETRY_COUNT = 2;
const SESSION_FETCH_RETRY_DELAY_MS = 1500;

function formatSourceLabel(sourceName) {
  if (typeof sourceName !== "string" || sourceName.trim() === "") {
    return SOURCE_LABELS["pasted-json"];
  }

  return SOURCE_LABELS[sourceName] || sourceName;
}

const exampleSession = {
  user: {
    id: "user-example",
    email: "mark@example.com",
  },
  expires: "2026-08-06T14:29:36.155Z",
  account: {
    id: "00000000-0000-4000-9000-000000000000",
    planType: "plus",
  },
  accessToken: "paste-real-access-token-here",
  sessionToken: "paste-real-session-token-here",
  authProvider: "openai",
};
