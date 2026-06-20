const state = {
  format: "sub2api",
  sessions: [],
  converted: [],
  skipped: [],
  outputText: "",
};

let lastSafeInput = "";

const elements = {
  accountBody: document.querySelector("#account-body"),
  clearInput: document.querySelector("#clear-input"),
  copyOutput: document.querySelector("#copy-output"),
  cpaNotice: document.querySelector("#cpa-notice"),
  downloadOutput: document.querySelector("#download-output"),
  dropZone: document.querySelector("#drop-zone"),
  fileInput: document.querySelector("#file-input"),
  formatButtons: Array.from(document.querySelectorAll("[data-format]")),
  input: document.querySelector("#session-input"),
  inputStatus: document.querySelector("#input-status"),
  issues: document.querySelector("#issues"),
  loadExample: document.querySelector("#load-example"),
  output: document.querySelector("#output"),
  outputStatus: document.querySelector("#output-status"),
  outputSubtitle: document.querySelector("#output-subtitle"),
  pickFiles: document.querySelector("#pick-files"),
  statCount: document.querySelector("#stat-count"),
  statErrors: document.querySelector("#stat-errors"),
  statFormat: document.querySelector("#stat-format"),
  syntheticWarnings: document.querySelector("#synthetic-warnings"),
};

function setStatus(element, text, tone = "") {
  element.textContent = text;
  element.classList.toggle("is-ok", tone === "ok");
  element.classList.toggle("is-error", tone === "error");
  element.classList.toggle("is-warning", tone === "warning");
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
  elements.cpaNotice.style.display = ["cpa", "cockpit", "codex", "axonhub", "codexmanager"].includes(state.format) ? "block" : "none";
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

bindDragAndDrop();
updateOutput();
