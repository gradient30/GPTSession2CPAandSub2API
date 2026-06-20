#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createFakeElement(selector, options = {}) {
  const classes = new Set();

  return {
    selector,
    attributes: {},
    dataset: options.dataset || {},
    disabled: false,
    files: [],
    innerHTML: "",
    listeners: {},
    style: {},
    textContent: "",
    value: "",
    classList: {
      add(name) {
        classes.add(name);
      },
      remove(name) {
        classes.delete(name);
      },
      toggle(name, force) {
        if (force === undefined) {
          if (classes.has(name)) {
            classes.delete(name);
          } else {
            classes.add(name);
          }
          return;
        }
        if (force) {
          classes.add(name);
        } else {
          classes.delete(name);
        }
      },
      contains(name) {
        return classes.has(name);
      },
    },
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    append() {},
    click() {
      this.listeners.click?.({ target: this });
    },
    remove() {},
    select() {},
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
  };
}

function loadPageScript(options = {}) {
  const htmlPath = path.join(__dirname, "..", "docs", "index.html");
  const html = fs.readFileSync(htmlPath, "utf8");
  const match = html.match(/<script>\s*([\s\S]*?)\s*<\/script>\s*<\/body>/);

  assert.ok(match, "expected docs/index.html to contain one inline script");

  const elements = new Map();
  const formatButtons = ["sub2api", "cpa", "cockpit", "9router", "codex", "axonhub", "codexmanager"].map((format) =>
    createFakeElement(`[data-format="${format}"]`, { dataset: { format } })
  );

  const sessionStorageData = {};
  const confirmImpl = options.confirmImpl || (() => true);

  const document = {
    body: createFakeElement("body"),
    createElement(selector) {
      return createFakeElement(selector);
    },
    execCommand() {
      return true;
    },
    querySelector(selector) {
      if (!elements.has(selector)) {
        elements.set(selector, createFakeElement(selector));
      }
      return elements.get(selector);
    },
    querySelectorAll(selector) {
      return selector === "[data-format]" ? formatButtons : [];
    },
  };

  const context = {
    Blob: class Blob {
      constructor(parts, options) {
        this.parts = parts;
        this.options = options;
      }
    },
    TextDecoder,
    TextEncoder,
    URL: {
      createObjectURL() {
        return "blob:test";
      },
      revokeObjectURL() {},
    },
    atob,
    btoa,
    clearTimeout,
    console,
    document,
    navigator: {
      clipboard: {
        async writeText() {},
      },
    },
    sessionStorage: {
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(sessionStorageData, key) ? sessionStorageData[key] : null;
      },
      setItem(key, value) {
        sessionStorageData[key] = String(value);
      },
      removeItem(key) {
        delete sessionStorageData[key];
      },
      clear() {
        for (const key of Object.keys(sessionStorageData)) {
          delete sessionStorageData[key];
        }
      },
    },
    setTimeout,
    window: {
      confirm: confirmImpl,
    },
  };

  vm.runInNewContext(match[1], context, { filename: "docs/index.html" });

  return { elements, formatButtons, html, sessionStorageData };
}

function dispatch(element, type) {
  assert.equal(typeof element.listeners[type], "function", `missing ${type} listener on ${element.selector}`);
  element.listeners[type]({ target: element });
}

function jwtWithPayload(payload) {
  return [
    Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "sig",
  ].join(".");
}

function testSub2apiAccountUsesAccessTokenExpiry() {
  const { elements } = loadPageScript();
  const input = elements.get("#session-input");
  const output = elements.get("#output");

  input.value = JSON.stringify({
    user: {
      email: "mark@example.com",
    },
    accessToken: jwtWithPayload({
      exp: 1780473960,
      "https://api.openai.com/auth": {
        chatgpt_account_id: "chatgpt-account-1",
      },
    }),
  });
  dispatch(input, "input");

  const document = JSON.parse(output.value);
  const account = document.accounts[0];

  assert.equal(document.expires_at, undefined);
  assert.equal(document.auto_pause_on_expired, undefined);
  assert.equal(document.accounts.length, 1);
  assert.equal(account.expires_at, 1780473960);
  assert.equal(account.auto_pause_on_expired, true);
}

function testSub2apiAccountsUseTheirOwnAccessTokenExpiry() {
  const { elements } = loadPageScript();
  const input = elements.get("#session-input");
  const output = elements.get("#output");

  input.value = JSON.stringify([
    {
      email: "late@example.com",
      accessToken: jwtWithPayload({
        exp: 1780473960,
        "https://api.openai.com/auth": {
          chatgpt_account_id: "chatgpt-account-late",
        },
      }),
    },
    {
      email: "early@example.com",
      accessToken: jwtWithPayload({
        exp: 1780000000,
        "https://api.openai.com/auth": {
          chatgpt_account_id: "chatgpt-account-early",
        },
      }),
    },
  ]);
  dispatch(input, "input");

  const document = JSON.parse(output.value);

  assert.equal(document.expires_at, undefined);
  assert.equal(document.auto_pause_on_expired, undefined);
  assert.equal(document.accounts.length, 2);
  assert.equal(document.accounts[0].expires_at, 1780473960);
  assert.equal(document.accounts[0].auto_pause_on_expired, true);
  assert.equal(document.accounts[1].expires_at, 1780000000);
  assert.equal(document.accounts[1].auto_pause_on_expired, true);
}

function testSub2apiAccountWithRefreshTokenOmitsAccessTokenExpiry() {
  const { elements } = loadPageScript();
  const input = elements.get("#session-input");
  const output = elements.get("#output");

  input.value = JSON.stringify({
    user: {
      email: "refreshable@example.com",
    },
    accessToken: jwtWithPayload({
      exp: 1780473960,
      "https://api.openai.com/auth": {
        chatgpt_account_id: "chatgpt-account-refreshable",
      },
    }),
    refreshToken: "real-refresh-token",
    expiresAt: "2026-06-01T00:00:00.000Z",
  });
  dispatch(input, "input");

  const document = JSON.parse(output.value);
  const account = document.accounts[0];

  assert.equal(account.expires_at, undefined);
  assert.equal(account.auto_pause_on_expired, undefined);
  assert.equal(account.credentials.expires_at, undefined);
  assert.equal(account.credentials.expires_in, undefined);
}

function testSyntheticIdTokenHasCodexParseableJwtFormat() {
  const { elements, formatButtons } = loadPageScript();
  const cpaButton = formatButtons.find((button) => button.dataset.format === "cpa");
  const input = elements.get("#session-input");
  const output = elements.get("#output");

  dispatch(cpaButton, "click");
  input.value = JSON.stringify({
    user: {
      id: "user-test",
      email: "mark@example.com",
    },
    expires: "2026-08-06T14:29:36.155Z",
    account: {
      id: "00000000-0000-4000-9000-000000000000",
      planType: "plus",
    },
    accessToken: "access-token",
    sessionToken: "session-token",
  });
  dispatch(input, "input");

  const cpa = JSON.parse(output.value);
  const parts = cpa.id_token.split(".");

  assert.equal(cpa.id_token_synthetic, true);
  assert.equal(parts.length, 3);
  assert.ok(
    parts.every((part) => part.length > 0),
    "synthetic id_token must use non-empty header, payload, and signature segments"
  );

  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  assert.equal(payload.email, "mark@example.com");
  assert.equal(payload["https://api.openai.com/auth"].chatgpt_account_id, "00000000-0000-4000-9000-000000000000");
}

function testAxonHubAuthJsonUsesPlaceholderRefreshTokenWhenMissing() {
  const { elements, formatButtons } = loadPageScript();
  const axonHubButton = formatButtons.find((button) => button.dataset.format === "axonhub");
  const input = elements.get("#session-input");
  const output = elements.get("#output");

  dispatch(axonHubButton, "click");
  input.value = JSON.stringify({
    user: {
      id: "user-test",
      email: "mark@example.com",
    },
    expires: "2026-08-06T14:29:36.155Z",
    account: {
      id: "00000000-0000-4000-9000-000000000000",
      planType: "plus",
    },
    accessToken: "access-token",
    sessionToken: "session-token",
  });
  dispatch(input, "input");

  const authJson = JSON.parse(output.value);

  assert.equal(authJson.auth_mode, "chatgpt");
  assert.equal(authJson.tokens.access_token, "access-token");
  assert.equal(authJson.tokens.refresh_token, "__missing_refresh_token__");
  assert.equal(authJson.tokens.id_token.split(".").length, 3);
  assert.equal(authJson.last_refresh, "2026-08-06T13:29:36.155Z");
  assert.equal(authJson.axonhub_refresh_token_placeholder, true);
  assert.equal(authJson.axonhub_note, "refresh_token 为占位值；access_token 过期前可用，过期后无法自动刷新。");
}

function testAxonHubAuthJsonPreservesRealRefreshToken() {
  const { elements, formatButtons } = loadPageScript();
  const axonHubButton = formatButtons.find((button) => button.dataset.format === "axonhub");
  const input = elements.get("#session-input");
  const output = elements.get("#output");

  dispatch(axonHubButton, "click");
  input.value = JSON.stringify({
    user: {
      email: "mark@example.com",
    },
    expires: "2026-08-06T14:29:36.155Z",
    account: {
      id: "00000000-0000-4000-9000-000000000000",
      planType: "plus",
    },
    accessToken: "access-token",
    refreshToken: "real-refresh-token",
    idToken: "real.header.signature",
  });
  dispatch(input, "input");

  const authJson = JSON.parse(output.value);

  assert.equal(authJson.tokens.refresh_token, "real-refresh-token");
  assert.equal(authJson.tokens.id_token, "real.header.signature");
  assert.equal(authJson.axonhub_refresh_token_placeholder, undefined);
  assert.equal(authJson.axonhub_note, undefined);
}

function testCodexAuthJsonMatchesNativeShapeWhenMissingRefreshToken() {
  const { elements, formatButtons } = loadPageScript();
  const codexButton = formatButtons.find((button) => button.dataset.format === "codex");
  const input = elements.get("#session-input");
  const output = elements.get("#output");

  dispatch(codexButton, "click");
  input.value = JSON.stringify({
    user: {
      id: "user-test",
      email: "mark@example.com",
    },
    expires: "2026-08-06T14:29:36.155Z",
    account: {
      id: "00000000-0000-4000-9000-000000000000",
      planType: "plus",
    },
    accessToken: "access-token",
    sessionToken: "session-token",
  });
  dispatch(input, "input");

  const authJson = JSON.parse(output.value);

  assert.equal(authJson.auth_mode, "chatgpt");
  assert.equal(authJson.OPENAI_API_KEY, null);
  assert.equal(authJson.tokens.access_token, "access-token");
  assert.equal(authJson.tokens.refresh_token, "");
  assert.equal(authJson.tokens.id_token.split(".").length, 3);
  assert.equal(authJson.tokens.account_id, "00000000-0000-4000-9000-000000000000");
  assert.match(authJson.last_refresh, /^\d{4}-\d{2}-\d{2}T/);
}

function testCodexAuthJsonPreservesRealRefreshTokenAndIdToken() {
  const { elements, formatButtons } = loadPageScript();
  const codexButton = formatButtons.find((button) => button.dataset.format === "codex");
  const input = elements.get("#session-input");
  const output = elements.get("#output");

  dispatch(codexButton, "click");
  input.value = JSON.stringify({
    user: {
      email: "mark@example.com",
    },
    accessToken: "access-token",
    refreshToken: "real-refresh-token",
    idToken: "real.header.signature",
    tokens: {
      account_id: "chatgpt-account-1",
    },
  });
  dispatch(input, "input");

  const authJson = JSON.parse(output.value);

  assert.equal(authJson.auth_mode, "chatgpt");
  assert.equal(authJson.OPENAI_API_KEY, null);
  assert.equal(authJson.tokens.access_token, "access-token");
  assert.equal(authJson.tokens.refresh_token, "real-refresh-token");
  assert.equal(authJson.tokens.id_token, "real.header.signature");
  assert.equal(authJson.tokens.account_id, "chatgpt-account-1");
}

function testCodexManagerAuthJsonUsesEmptyRefreshTokenWhenMissing() {
  const { elements, formatButtons } = loadPageScript();
  const codexManagerButton = formatButtons.find((button) => button.dataset.format === "codexmanager");
  const input = elements.get("#session-input");
  const output = elements.get("#output");

  dispatch(codexManagerButton, "click");
  input.value = JSON.stringify({
    user: {
      id: "user-test",
      email: "mark@example.com",
    },
    expires: "2026-08-06T14:29:36.155Z",
    account: {
      id: "00000000-0000-4000-9000-000000000000",
      planType: "plus",
    },
    accessToken: "access-token",
    sessionToken: "session-token",
  });
  dispatch(input, "input");

  const authJson = JSON.parse(output.value);

  assert.equal(authJson.tokens.access_token, "access-token");
  assert.equal(authJson.tokens.refresh_token, "");
  assert.equal(authJson.tokens.id_token, "");
  assert.equal(authJson.tokens.account_id, "00000000-0000-4000-9000-000000000000");
  assert.equal(authJson.meta.label, "mark@example.com");
  assert.equal(authJson.meta.note, "从 ChatGPT 会话导入");
}

function testCodexManagerAuthJsonPreservesRealRefreshAndMetadata() {
  const { elements, formatButtons } = loadPageScript();
  const codexManagerButton = formatButtons.find((button) => button.dataset.format === "codexmanager");
  const input = elements.get("#session-input");
  const output = elements.get("#output");

  dispatch(codexManagerButton, "click");
  input.value = JSON.stringify({
    user: {
      email: "mark@example.com",
    },
    accessToken: "access-token",
    refreshToken: "real-refresh-token",
    idToken: "real.header.signature",
    workspaceId: "workspace-1",
    chatgptAccountId: "chatgpt-account-1",
  });
  dispatch(input, "input");

  const authJson = JSON.parse(output.value);

  assert.equal(authJson.tokens.refresh_token, "real-refresh-token");
  assert.equal(authJson.tokens.id_token, "real.header.signature");
  assert.equal(authJson.tokens.chatgpt_account_id, "chatgpt-account-1");
  assert.equal(authJson.meta.workspace_id, "workspace-1");
  assert.equal(authJson.meta.chatgpt_account_id, "chatgpt-account-1");
}

function createJsonFile(name, content) {
  return {
    name,
    webkitRelativePath: name,
    async text() {
      return content;
    },
  };
}

function waitForMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function testDragDropReadsJsonFile() {
  const { elements } = loadPageScript();
  const dropZone = elements.get("#drop-zone");
  const output = elements.get("#output");

  assert.equal(typeof dropZone.listeners.drop, "function", "drop-zone must handle file drops");

  dropZone.listeners.drop({
    preventDefault() {},
    currentTarget: dropZone,
    dataTransfer: {
      files: [
        createJsonFile("session.json", JSON.stringify({
          user: { email: "drop@example.com" },
          accessToken: jwtWithPayload({
            exp: 1780473960,
            "https://api.openai.com/auth": { chatgpt_account_id: "drop-account" },
          }),
        })),
      ],
    },
  });

  await waitForMicrotasks();

  const document = JSON.parse(output.value);
  assert.equal(document.accounts.length, 1);
  assert.equal(document.accounts[0].credentials.email, "drop@example.com");
}

function testSensitiveConsentRejectsPaste() {
  const { elements } = loadPageScript({ confirmImpl: () => false });
  const input = elements.get("#session-input");
  const output = elements.get("#output");

  input.value = "";
  dispatch(input, "input");

  input.value = JSON.stringify({
    user: { email: "secret@example.com" },
    accessToken: "super-secret-access-token-value",
  });
  dispatch(input, "input");

  assert.equal(input.value, "");
  assert.equal(output.value, "");
}

function testSyntheticWarningsVisibleForCpaOutput() {
  const { elements, formatButtons } = loadPageScript();
  const cpaButton = formatButtons.find((button) => button.dataset.format === "cpa");
  const input = elements.get("#session-input");
  const warnings = elements.get("#synthetic-warnings");

  dispatch(cpaButton, "click");
  input.value = JSON.stringify({
    user: { email: "mark@example.com" },
    account: { id: "00000000-0000-4000-9000-000000000000", planType: "plus" },
    accessToken: "access-token-value",
    sessionToken: "session-token-value",
  });
  dispatch(input, "input");

  assert.ok(warnings.classList.contains("is-visible"));
  assert.match(warnings.innerHTML, /合成 id_token/);
}

function testClearInputHighlightsAfterConversion() {
  const { elements } = loadPageScript();
  const input = elements.get("#session-input");
  const clearButton = elements.get("#clear-input");

  input.value = JSON.stringify({
    user: { email: "mark@example.com" },
    accessToken: jwtWithPayload({
      exp: 1780473960,
      "https://api.openai.com/auth": { chatgpt_account_id: "chatgpt-account-1" },
    }),
  });
  dispatch(input, "input");

  assert.ok(clearButton.classList.contains("button-warning"));
}

async function testDragDropRejectsNonJsonFile() {
  const { elements } = loadPageScript();
  const dropZone = elements.get("#drop-zone");
  const inputStatus = elements.get("#input-status");

  dropZone.listeners.drop({
    preventDefault() {},
    currentTarget: dropZone,
    dataTransfer: {
      files: [createJsonFile("notes.txt", "not json")],
    },
  });

  await waitForMicrotasks();
  assert.match(inputStatus.textContent, /没有选择 JSON 文件/);
}

async function testDragDropInvalidSessionShowsError() {
  const { elements } = loadPageScript();
  const dropZone = elements.get("#drop-zone");
  const inputStatus = elements.get("#input-status");
  const output = elements.get("#output");

  dropZone.listeners.drop({
    preventDefault() {},
    currentTarget: dropZone,
    dataTransfer: {
      files: [createJsonFile("empty.json", JSON.stringify({ hello: "world" }))],
    },
  });

  await waitForMicrotasks();
  assert.equal(output.value, "");
  assert.match(inputStatus.textContent, /生成 0 个账号|没有可转换账号/);
}

function testDragOverAddsVisualClass() {
  const { elements } = loadPageScript();
  const dropZone = elements.get("#drop-zone");

  dropZone.listeners.dragover({
    preventDefault() {},
    currentTarget: dropZone,
  });
  assert.ok(dropZone.classList.contains("is-dragover"));

  dropZone.listeners.drop({
    preventDefault() {},
    currentTarget: dropZone,
    relatedTarget: null,
    dataTransfer: { files: [] },
  });
  assert.equal(dropZone.classList.contains("is-dragover"), false);
}

function testAxonHubSyntheticWarningsVisible() {
  const { elements, formatButtons } = loadPageScript();
  const axonHubButton = formatButtons.find((button) => button.dataset.format === "axonhub");
  const input = elements.get("#session-input");
  const warnings = elements.get("#synthetic-warnings");

  dispatch(axonHubButton, "click");
  input.value = JSON.stringify({
    user: { email: "mark@example.com" },
    account: { id: "00000000-0000-4000-9000-000000000000", planType: "plus" },
    accessToken: "access-token-value",
    sessionToken: "session-token-value",
  });
  dispatch(input, "input");

  assert.ok(warnings.classList.contains("is-visible"));
  assert.match(warnings.innerHTML, /refresh_token 占位值/);
}

async function testCopyOutputShowsCustodyWarning() {
  const { elements } = loadPageScript();
  const input = elements.get("#session-input");
  const outputStatus = elements.get("#output-status");
  const copyButton = elements.get("#copy-output");

  input.value = JSON.stringify({
    user: { email: "mark@example.com" },
    accessToken: jwtWithPayload({
      exp: 1780473960,
      "https://api.openai.com/auth": { chatgpt_account_id: "chatgpt-account-1" },
    }),
  });
  dispatch(input, "input");

  await copyButton.listeners.click();
  await waitForMicrotasks();

  assert.match(outputStatus.textContent, /妥善保管/);
}

function testDownloadOutputShowsCustodyWarning() {
  const { elements } = loadPageScript();
  const input = elements.get("#session-input");
  const outputStatus = elements.get("#output-status");
  const downloadButton = elements.get("#download-output");

  input.value = JSON.stringify({
    user: { email: "mark@example.com" },
    accessToken: jwtWithPayload({
      exp: 1780473960,
      "https://api.openai.com/auth": { chatgpt_account_id: "chatgpt-account-1" },
    }),
  });
  dispatch(input, "input");
  downloadButton.listeners.click();

  assert.match(outputStatus.textContent, /妥善保管/);
}

function testOutputStatusSuggestsClearInput() {
  const { elements } = loadPageScript();
  const input = elements.get("#session-input");
  const outputStatus = elements.get("#output-status");

  input.value = JSON.stringify({
    user: { email: "mark@example.com" },
    accessToken: jwtWithPayload({
      exp: 1780473960,
      "https://api.openai.com/auth": { chatgpt_account_id: "chatgpt-account-1" },
    }),
  });
  dispatch(input, "input");

  assert.match(outputStatus.textContent, /建议立即清空输入/);
}

function testExampleSessionSkipsSensitiveConfirm() {
  let confirmCalls = 0;
  const { elements } = loadPageScript({
    confirmImpl: () => {
      confirmCalls += 1;
      return true;
    },
  });
  const input = elements.get("#session-input");

  dispatch(elements.get("#load-example"), "click");
  assert.ok(input.value.includes("paste-real-access-token-here"));
  assert.equal(confirmCalls, 0);
}

function testAllSevenFormatsProduceOutput() {
  const { elements, formatButtons } = loadPageScript();
  const input = elements.get("#session-input");
  const output = elements.get("#output");

  input.value = JSON.stringify({
    user: { email: "mark@example.com" },
    account: { id: "00000000-0000-4000-9000-000000000000", planType: "plus" },
    accessToken: jwtWithPayload({
      exp: 1780473960,
      "https://api.openai.com/auth": { chatgpt_account_id: "chatgpt-account-1" },
    }),
    refreshToken: "real-refresh-token",
    idToken: "real.header.signature",
  });
  dispatch(input, "input");

  for (const button of formatButtons) {
    dispatch(button, "click");
    assert.ok(output.value.length > 0, `expected output for format ${button.dataset.format}`);
    JSON.parse(output.value);
  }
}

function testBuildMetadataEmbeddedInHtml() {
  const { html } = loadPageScript();
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));

  assert.match(html, new RegExp(`content="v${pkg.version}"`));
  assert.match(html, /content="\d{4}-\d{2}-\d{2}"/);
  assert.match(html, /name="build-sha256" content="[a-f0-9]{12}"/);
  assert.match(html, /name="build-sha256-full" content="[a-f0-9]{64}"/);
  assert.match(html, /connect-src 'none'/);
  assert.doesNotMatch(html, /discord-card/);
}

async function runTests() {
  testSub2apiAccountUsesAccessTokenExpiry();
  testSub2apiAccountsUseTheirOwnAccessTokenExpiry();
  testSub2apiAccountWithRefreshTokenOmitsAccessTokenExpiry();
  testSyntheticIdTokenHasCodexParseableJwtFormat();
  testAxonHubAuthJsonUsesPlaceholderRefreshTokenWhenMissing();
  testAxonHubAuthJsonPreservesRealRefreshToken();
  testCodexAuthJsonMatchesNativeShapeWhenMissingRefreshToken();
  testCodexAuthJsonPreservesRealRefreshTokenAndIdToken();
  testCodexManagerAuthJsonUsesEmptyRefreshTokenWhenMissing();
  testCodexManagerAuthJsonPreservesRealRefreshAndMetadata();
  await testDragDropReadsJsonFile();
  await testDragDropRejectsNonJsonFile();
  await testDragDropInvalidSessionShowsError();
  testDragOverAddsVisualClass();
  testSensitiveConsentRejectsPaste();
  testSyntheticWarningsVisibleForCpaOutput();
  testAxonHubSyntheticWarningsVisible();
  testClearInputHighlightsAfterConversion();
  testOutputStatusSuggestsClearInput();
  testExampleSessionSkipsSensitiveConfirm();
  await testCopyOutputShowsCustodyWarning();
  testDownloadOutputShowsCustodyWarning();
  testAllSevenFormatsProduceOutput();
  testBuildMetadataEmbeddedInHtml();
  console.log("convert-session tests passed");
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
