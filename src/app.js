const state = {
  format: "sub2api",
  sessions: [],
  converted: [],
  skipped: [],
  outputText: "",
};

let lastSafeInput = "";
let sessionFetchActive = false;
let sessionFetchCountdownTimer = null;

const THEME_STORAGE_KEY = "gpt-session-converter-theme";

const elements = {
  accountBody: document.querySelector("#account-body"),
  clearInput: document.querySelector("#clear-input"),
  copyOutput: document.querySelector("#copy-output"),
  detailHelpPanel: document.querySelector("#detail-help-panel"),
  detailHelpToggle: document.querySelector("#detail-help-toggle"),
  downloadOutput: document.querySelector("#download-output"),
  dropZone: document.querySelector("#drop-zone"),
  fileInput: document.querySelector("#file-input"),
  formatButtons: Array.from(document.querySelectorAll("[data-format]")),
  helpBackdrop: document.querySelector("#help-backdrop"),
  helpPanel: document.querySelector("#help-panel"),
  helpToggle: document.querySelector("#help-toggle"),
  input: document.querySelector("#session-input"),
  inputStatus: document.querySelector("#input-status"),
  issues: document.querySelector("#issues"),
  loadExample: document.querySelector("#load-example"),
  openSessionLink: document.querySelector("#open-session-link"),
  output: document.querySelector("#output"),
  outputStatus: document.querySelector("#output-status"),
  outputSubtitle: document.querySelector("#output-subtitle"),
  pickFiles: document.querySelector("#pick-files"),
  statCount: document.querySelector("#stat-count"),
  statErrors: document.querySelector("#stat-errors"),
  statFormat: document.querySelector("#stat-format"),
  syntheticWarnings: document.querySelector("#synthetic-warnings"),
  themeToggle: document.querySelector("#theme-toggle"),
  themeToggleIcon: document.querySelector("#theme-toggle-icon"),
  themeToggleLabel: document.querySelector("#theme-toggle-label"),
};

function setStatus(element, text, tone = "") {
  element.textContent = text;
  element.classList.toggle("is-ok", tone === "ok");
  element.classList.toggle("is-error", tone === "error");
  element.classList.toggle("is-warning", tone === "warning");
}

function applyTheme(theme) {
  const nextTheme = theme === "dark" ? "dark" : "light";
  document.documentElement?.setAttribute("data-theme", nextTheme);

  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) {
    themeMeta.setAttribute("content", nextTheme === "dark" ? "#1A1612" : "#F4EDE4");
  }

  if (elements.themeToggleIcon) {
    elements.themeToggleIcon.textContent = nextTheme === "dark" ? "☾" : "☀";
  }

  if (elements.themeToggleLabel) {
    elements.themeToggleLabel.textContent = nextTheme === "dark" ? "深色" : "浅色";
  }

  try {
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  } catch {
    // ignore storage failures
  }
}

function initTheme() {
  let savedTheme = "light";

  try {
    savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || "light";
  } catch {
    savedTheme = "light";
  }

  if (savedTheme !== "dark" && savedTheme !== "light") {
    savedTheme = typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  applyTheme(savedTheme);

  elements.themeToggle?.addEventListener("click", () => {
    const current = document.documentElement?.getAttribute("data-theme") === "dark" ? "dark" : "light";
    applyTheme(current === "dark" ? "light" : "dark");
  });
}

const FORMATS_WITH_DETAIL_HELP = ["cpa", "cockpit", "codex", "axonhub", "codexmanager"];

function syncHelpBackdrop() {
  const open =
    elements.helpPanel?.classList.contains("is-visible") ||
    elements.detailHelpPanel?.classList.contains("is-visible");
  elements.helpBackdrop?.classList.toggle("is-visible", open);
  elements.helpBackdrop?.setAttribute("aria-hidden", String(!open));
}

function setHelpOpen(open) {
  if (!elements.helpPanel || !elements.helpToggle) {
    return;
  }

  if (open) {
    setDetailHelpOpen(false);
  }

  elements.helpPanel.classList.toggle("is-visible", open);
  elements.helpPanel.setAttribute("aria-hidden", String(!open));
  elements.helpToggle.setAttribute("aria-expanded", String(open));
  syncHelpBackdrop();
}

function setDetailHelpOpen(open) {
  if (!elements.detailHelpPanel || !elements.detailHelpToggle) {
    return;
  }

  if (open) {
    setHelpOpen(false);
  }

  elements.detailHelpPanel.classList.toggle("is-visible", open);
  elements.detailHelpPanel.setAttribute("aria-hidden", String(!open));
  elements.detailHelpToggle.setAttribute("aria-expanded", String(open));
  syncHelpBackdrop();
}

function bindHelp() {
  if (!elements.helpToggle || !elements.helpPanel) {
    return;
  }

  elements.helpToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = !elements.helpPanel.classList.contains("is-visible");
    setHelpOpen(open);
  });

  elements.helpBackdrop?.addEventListener("click", () => {
    setHelpOpen(false);
    setDetailHelpOpen(false);
  });

  document.addEventListener?.("click", (event) => {
    const helpOpen = elements.helpPanel.classList.contains("is-visible");
    const detailOpen = elements.detailHelpPanel?.classList.contains("is-visible");

    if (!helpOpen && !detailOpen) {
      return;
    }

    if (
      elements.helpPanel.contains(event.target) ||
      elements.helpToggle.contains(event.target) ||
      elements.detailHelpPanel?.contains(event.target) ||
      elements.detailHelpToggle?.contains(event.target)
    ) {
      return;
    }

    setHelpOpen(false);
    setDetailHelpOpen(false);
  });
}

function bindDetailHelp() {
  if (!elements.detailHelpToggle || !elements.detailHelpPanel) {
    return;
  }

  elements.detailHelpToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = !elements.detailHelpPanel.classList.contains("is-visible");
    setDetailHelpOpen(open);
  });
}

function updateOutput() {
  const hasConverted = state.converted.length > 0;
  let outputText = "";

  if (hasConverted) {
    outputText = JSON.stringify(buildOutputDocument(state.format, state.converted), null, 2);
  }

  state.outputText = outputText;
  elements.output.value = outputText;
  elements.copyOutput.disabled = !outputText;
  elements.downloadOutput.disabled = !outputText;
  elements.statCount.textContent = String(state.converted.length);
  elements.statErrors.textContent = String(state.skipped.length);
  elements.statFormat.textContent = OUTPUT_LABELS[state.format];
  elements.outputSubtitle.textContent = `当前输出为 ${OUTPUT_LABELS[state.format]} 导入 JSON。`;
  const showDetailHelp = FORMATS_WITH_DETAIL_HELP.includes(state.format);
  elements.detailHelpToggle?.classList.toggle("hidden", !showDetailHelp);
  if (!showDetailHelp) {
    setDetailHelpOpen(false);
  }
  elements.clearInput.classList.toggle("button-warning", hasConverted);

  renderAccounts();
  renderIssues();
  renderSyntheticWarnings();

  if (outputText) {
    setStatus(
      elements.outputStatus,
      `已生成 ${state.converted.length} 个账号。建议立即清空输入以降低凭证暴露风险。`,
      "warning",
    );
  } else {
    setStatus(elements.outputStatus, "暂无输出。", state.skipped.length ? "error" : "");
  }
}

function renderAccounts() {
  if (!state.converted.length) {
    elements.accountBody.innerHTML = '<tr><td colspan="4" class="empty">暂无可转换账号。</td></tr>';
    return;
  }

  elements.accountBody.innerHTML = state.converted.map((item) => `
    <tr>
      <td><div class="cell-clip" title="${escapeHtml(item.name)}">${escapeHtml(item.name || "-")}</div></td>
      <td><div class="cell-clip" title="${escapeHtml(item.email)}">${escapeHtml(item.email || "-")}</div></td>
      <td><div class="cell-clip" title="${escapeHtml(item.expiresAt)}">${escapeHtml(formatDisplayDate(item.expiresAt) || "-")}</div></td>
      <td><div class="cell-clip" title="${escapeHtml(formatSourceLabel(item.sourceName))}">${escapeHtml(formatSourceLabel(item.sourceName))}</div></td>
    </tr>
  `).join("");
}

function renderIssues() {
  if (!state.skipped.length) {
    elements.issues.classList.remove("is-visible");
    elements.issues.textContent = "";
    return;
  }

  elements.issues.classList.add("is-visible");
  elements.issues.innerHTML = state.skipped
    .map((item) => `<div>${escapeHtml(formatSourceLabel(item.sourceName) || "输入")} ${escapeHtml(item.path || "")}：${escapeHtml(item.reason)}</div>`)
    .join("");
}

function renderSyntheticWarnings() {
  const warnings = getSyntheticWarnings(state.converted, state.format);
  if (!warnings.length) {
    elements.syntheticWarnings.classList.remove("is-visible");
    elements.syntheticWarnings.innerHTML = "";
    return;
  }

  elements.syntheticWarnings.classList.add("is-visible");
  elements.syntheticWarnings.innerHTML = warnings
    .map((warning) => `<div>${escapeHtml(warning)}</div>`)
    .join("");
}

function clearSessionFetchCountdown() {
  if (sessionFetchCountdownTimer !== null) {
    window.clearInterval(sessionFetchCountdownTimer);
    sessionFetchCountdownTimer = null;
  }
}

function setSessionLinkBusy(busy, buttonLabel) {
  const button = elements.openSessionLink;
  if (!button) {
    return;
  }

  if (!button.dataset.defaultLabel) {
    button.dataset.defaultLabel = button.textContent.trim();
  }

  button.disabled = busy;
  button.classList.toggle("is-loading", busy);
  button.setAttribute("aria-busy", String(busy));
  button.textContent = busy && buttonLabel ? buttonLabel : button.dataset.defaultLabel;
}

function updateSessionFetchCountdown(deadlineMs, getMessage, tone = "") {
  const leftMs = deadlineMs - Date.now();
  if (leftMs <= 0) {
    return 0;
  }

  const seconds = Math.max(1, Math.ceil(leftMs / 1000));
  setStatus(elements.inputStatus, getMessage(seconds, leftMs), tone);

  const button = elements.openSessionLink;
  if (button?.classList.contains("is-loading")) {
    button.textContent = `获取中 ${seconds}s`;
  }

  return leftMs;
}

function startSessionFetchCountdown(deadlineMs, getMessage, tone = "") {
  clearSessionFetchCountdown();
  updateSessionFetchCountdown(deadlineMs, getMessage, tone);
  sessionFetchCountdownTimer = window.setInterval(() => {
    updateSessionFetchCountdown(deadlineMs, getMessage, tone);
  }, 200);
}

function waitUntilDeadline(deadlineMs, getMessage, tone = "") {
  return new Promise((resolve) => {
    startSessionFetchCountdown(deadlineMs, getMessage, tone);

    const check = () => {
      const leftMs = deadlineMs - Date.now();
      if (!sessionFetchActive || leftMs <= 0) {
        clearSessionFetchCountdown();
        resolve();
        return;
      }

      window.setTimeout(check, Math.min(200, leftMs));
    };

    check();
  });
}

function openChatGptSessionPage() {
  window.open(CHATGPT_SESSION_URL, "_blank", "noopener,noreferrer");
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function requestCrossSiteCookieAccess() {
  if (typeof document.requestStorageAccess !== "function") {
    return;
  }

  try {
    if (typeof document.hasStorageAccess === "function" && (await document.hasStorageAccess())) {
      return;
    }

    await document.requestStorageAccess();
  } catch {
    // 部分浏览器不支持或用户拒绝时，仍尝试 fetch。
  }
}

async function fetchChatGptSession() {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), SESSION_FETCH_TIMEOUT_MS);

  try {
    return await fetch(CHATGPT_SESSION_URL, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json, text/plain, */*",
      },
    });
  } finally {
    window.clearTimeout(timer);
  }
}

async function fetchChatGptSessionPayload() {
  await requestCrossSiteCookieAccess();

  const response = await fetchChatGptSession();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const text = await response.text();
  if (!text.trim()) {
    throw new Error("session 接口返回为空");
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`session 响应不是有效 JSON：${error instanceof Error ? error.message : "parse error"}`);
  }

  const documents = collectSessionLikeObjects(parsed, "chatgpt-session");
  if (!documents.length) {
    throw new Error("响应中未找到有效的 ChatGPT session（需包含 accessToken 与用户信息）");
  }

  return documents;
}

function applySessionDocuments(documents) {
  const text = documents.length === 1
    ? JSON.stringify(documents[0].value, null, 2)
    : JSON.stringify(documents.map((item) => item.value), null, 2);

  elements.input.value = text;
  lastSafeInput = text;
  scheduleConvert();

  if (state.converted.length > 0) {
    setStatus(elements.inputStatus, "已自动填入 ChatGPT 会话 JSON。", "ok");
  } else {
    setStatus(elements.inputStatus, "已填入 session JSON，但未能解析为可转换账号。", "warning");
  }
}

async function waitBeforeSessionFallback(minWaitDeadline) {
  await waitUntilDeadline(
    minWaitDeadline,
    (seconds) => `[2/3] 自动获取未成功，继续等待 ${seconds} 秒后进入备用方案…`,
    "warning",
  );
}

async function fillSessionFromChatGpt() {
  if (!elements.openSessionLink || !elements.input) {
    return;
  }

  if (sessionFetchActive) {
    setStatus(elements.inputStatus, "会话 JSON 正在获取中，请勿重复点击。", "warning");
    return;
  }

  sessionFetchActive = true;
  const startedAt = Date.now();
  const fetchDeadline = startedAt + SESSION_FETCH_TIMEOUT_MS;
  const minWaitDeadline = startedAt + SESSION_FETCH_MIN_WAIT_MS;
  let lastError = null;

  setSessionLinkBusy(true, "获取中…");
  startSessionFetchCountdown(
    fetchDeadline,
    (seconds) => `[1/3] 正在从 ChatGPT 获取会话 JSON（剩余 ${seconds} 秒）…`,
  );

  try {
    for (let attempt = 1; attempt <= SESSION_FETCH_RETRY_COUNT; attempt += 1) {
      try {
        if (attempt > 1) {
          clearSessionFetchCountdown();
          setStatus(elements.inputStatus, `[1/3] 第 ${attempt} 次重试获取会话 JSON…`);
          startSessionFetchCountdown(
            fetchDeadline,
            (seconds) => `[1/3] 第 ${attempt} 次重试（剩余 ${seconds} 秒）…`,
          );
          await sleep(SESSION_FETCH_RETRY_DELAY_MS);
        }

        const documents = await fetchChatGptSessionPayload();
        clearSessionFetchCountdown();
        applySessionDocuments(documents);
        return;
      } catch (error) {
        lastError = error;
      }
    }

    clearSessionFetchCountdown();
    const reason = lastError instanceof Error ? lastError.message : "获取失败";
    await waitBeforeSessionFallback(minWaitDeadline);

    const openDeadline = Date.now() + SESSION_FALLBACK_OPEN_DELAY_MS;
    await waitUntilDeadline(
      openDeadline,
      (seconds) => `[3/3] 即将打开 session 页面（${seconds} 秒），请复制 JSON 后粘贴。`,
      "warning",
    );

    openChatGptSessionPage();
    setStatus(
      elements.inputStatus,
      `无法自动填入（${reason}），已打开 session 页面，请复制 JSON 后粘贴到输入框。`,
      "warning",
    );
  } finally {
    clearSessionFetchCountdown();
    sessionFetchActive = false;
    setSessionLinkBusy(false);
  }
}

function scheduleConvert() {
  const text = elements.input.value;
  if (!text.trim()) {
    state.converted = [];
    state.skipped = [];
    state.sessions = [];
    lastSafeInput = "";
    updateOutput();
    setStatus(elements.inputStatus, "等待输入。");
    return;
  }

  try {
    convertFromText(text, state);
    if (state.converted.length) {
      setStatus(elements.inputStatus, `解析完成：${state.converted.length} 个账号，跳过 ${state.skipped.length} 项。`, "ok");
    } else {
      setStatus(elements.inputStatus, "没有可转换账号。", "error");
    }
  } catch (error) {
    state.converted = [];
    state.skipped = [{
      sourceName: "pasted-json",
      path: "$",
      reason: error instanceof Error ? error.message : "JSON 解析失败",
    }];
    state.outputText = "";
    updateOutput();
    setStatus(elements.inputStatus, error instanceof Error ? error.message : "JSON 解析失败", "error");
  }
}

function handleInputChange() {
  const text = elements.input.value;
  if (text.trim() && looksLikeSensitiveCredentials(text)) {
    const allowed = ensureSensitiveConsent(text);
    if (!allowed) {
      elements.input.value = lastSafeInput;
      return;
    }
  }

  if (!looksLikeSensitiveCredentials(text)) {
    lastSafeInput = text;
  }

  scheduleConvert();
}

function downloadOutput() {
  if (!state.outputText) {
    return;
  }

  const first = state.converted[0];
  const base = sanitizeFileToken(first?.email || first?.name || state.format);
  const fileName = `${base}.${state.format}.${getTimestampToken()}.json`;
  const blob = new Blob([state.outputText], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus(elements.outputStatus, "已下载。请妥善保管导出文件，其中包含敏感凭证。", "warning");
}

async function copyOutput() {
  if (!state.outputText) {
    return;
  }

  try {
    await navigator.clipboard.writeText(state.outputText);
    setStatus(elements.outputStatus, "已复制到剪贴板。凭证已离开本页，请妥善保管。", "warning");
  } catch {
    elements.output.select();
    document.execCommand("copy");
    setStatus(elements.outputStatus, "已复制到剪贴板。凭证已离开本页，请妥善保管。", "warning");
  }
}

async function readFiles(files) {
  const jsonFiles = Array.from(files).filter((file) => file.name.toLowerCase().endsWith(".json"));
  if (!jsonFiles.length) {
    setStatus(elements.inputStatus, "没有选择 JSON 文件。", "error");
    return;
  }

  const documents = [];
  const skipped = [];

  for (const file of jsonFiles) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const found = collectSessionLikeObjects(parsed, file.webkitRelativePath || file.name);
      if (!found.length) {
        skipped.push({
          sourceName: file.webkitRelativePath || file.name,
          path: "$",
          reason: "未找到包含 accessToken 和 user/email 的 session 对象",
        });
      }
      documents.push(...found);
    } catch (error) {
      skipped.push({
        sourceName: file.webkitRelativePath || file.name,
        path: "$",
        reason: error instanceof Error ? error.message : "无法读取文件",
      });
    }
  }

  const now = new Date();
  const converted = [];
  const convertSkipped = [...skipped];
  documents.forEach((item) => {
    try {
      converted.push(convertSession(item.value, {
        now,
        sourceName: item.sourceName,
        sourcePath: item.path,
      }));
    } catch (error) {
      convertSkipped.push({
        sourceName: item.sourceName,
        path: item.path,
        reason: error instanceof Error ? error.message : "无法转换",
      });
    }
  });

  state.sessions = documents;
  state.converted = converted;
  state.skipped = convertSkipped;
  elements.input.value = documents.length === 1
    ? JSON.stringify(documents[0].value, null, 2)
    : JSON.stringify(documents.map((item) => item.value), null, 2);
  lastSafeInput = elements.input.value;
  updateOutput();
  setStatus(
    elements.inputStatus,
    `读取 ${jsonFiles.length} 个文件，生成 ${converted.length} 个账号，跳过 ${convertSkipped.length} 项。`,
    converted.length ? "ok" : "error",
  );
}

function bindDragAndDrop() {
  const zone = elements.dropZone;

  zone.addEventListener("dragover", (event) => {
    event.preventDefault();
    zone.classList.add("is-dragover");
  });

  zone.addEventListener("dragleave", (event) => {
    if (event.currentTarget === event.target || !zone.contains(event.relatedTarget)) {
      zone.classList.remove("is-dragover");
    }
  });

  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    zone.classList.remove("is-dragover");
    if (event.dataTransfer?.files?.length) {
      readFiles(event.dataTransfer.files);
    }
  });
}

elements.formatButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.format = button.dataset.format;
    elements.formatButtons.forEach((item) => {
      item.setAttribute("aria-pressed", String(item === button));
    });
    updateOutput();
  });
});

elements.input.addEventListener("input", () => {
  handleInputChange();
});
elements.copyOutput.addEventListener("click", copyOutput);
elements.downloadOutput.addEventListener("click", downloadOutput);
elements.pickFiles.addEventListener("click", () => elements.fileInput.click());
elements.fileInput.addEventListener("change", (event) => {
  readFiles(event.target.files);
  event.target.value = "";
});

elements.clearInput.addEventListener("click", () => {
  elements.input.value = "";
  lastSafeInput = "";
  scheduleConvert();
  setStatus(elements.inputStatus, "已清空输入。", "ok");
});

elements.loadExample.addEventListener("click", () => {
  elements.input.value = JSON.stringify(exampleSession, null, 2);
  lastSafeInput = elements.input.value;
  scheduleConvert();
});

elements.openSessionLink?.addEventListener("click", () => {
  fillSessionFromChatGpt();
});

bindDragAndDrop();
initTheme();
bindHelp();
bindDetailHelp();
updateOutput();
