const OUTPUT_LABELS = {
  sub2api: "sub2api",
  cpa: "CPA",
  cockpit: "Cockpit",
  "9router": "9router",
  codex: "Codex",
  axonhub: "AxonHub",
  codexmanager: "Codex-Manager",
};

const AXONHUB_PLACEHOLDER_REFRESH_TOKEN = "__missing_refresh_token__";
const SENSITIVE_SKIP_KEY = "gpt-session-converter-sensitive-skip";

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
