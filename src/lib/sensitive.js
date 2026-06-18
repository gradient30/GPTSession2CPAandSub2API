function looksLikeSensitiveCredentials(text) {
  if (typeof text !== "string" || text.trim() === "") {
    return false;
  }

  if (text.includes("paste-real-access-token-here") || text.includes("paste-real-session-token-here")) {
    return false;
  }

  return /"(accessToken|access_token|sessionToken|session_token|refresh_token|refreshToken)"\s*:\s*"[^"]{8,}"/.test(text);
}

function ensureSensitiveConsent(text) {
  if (!looksLikeSensitiveCredentials(text)) {
    return true;
  }

  if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(SENSITIVE_SKIP_KEY) === "1") {
    return true;
  }

  const confirmed = window.confirm(
    "即将在本地处理敏感登录凭证（accessToken / sessionToken 等）。\n\n数据不会上传网络，但会暂留在本页内存中。\n\n确认继续？",
  );
  if (!confirmed) {
    return false;
  }

  const skipFuture = window.confirm("本会话不再提示？\n\n确定 = 本会话不再提示\n取消 = 下次粘贴仍提示");
  if (skipFuture && typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(SENSITIVE_SKIP_KEY, "1");
  }

  return true;
}

function getSyntheticWarnings(converted, format) {
  const warnings = [];
  if (!converted.length) {
    return warnings;
  }

  const hasSyntheticId = converted.some((item) => item.cpa?.id_token_synthetic);
  if (hasSyntheticId && ["cpa", "cockpit", "codex", "axonhub"].includes(format)) {
    warnings.push("部分账号使用了合成 id_token（id_token_synthetic），若下游工具校验 JWT 签名可能失败。");
  }

  const hasAxonPlaceholder = converted.some((item) => item.axonHub?.axonhub_refresh_token_placeholder);
  if (hasAxonPlaceholder && format === "axonhub") {
    warnings.push("AxonHub 输出含 refresh_token 占位值，access_token 过期后无法自动刷新。");
  }

  return warnings;
}
