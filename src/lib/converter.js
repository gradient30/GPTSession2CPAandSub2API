function collectSessionLikeObjects(value, sourceName = "pasted-json") {
  const found = [];
  const visited = new WeakSet();

  function visit(item, path) {
    if (!isPlainObject(item) && !Array.isArray(item)) {
      return;
    }

    if (isPlainObject(item)) {
      if (visited.has(item)) {
        return;
      }
      visited.add(item);

      const token = firstNonEmpty(
        item.accessToken,
        item.access_token,
        item.tokens?.accessToken,
        item.tokens?.access_token,
        item.token?.accessToken,
        item.token?.access_token,
        item.credentials?.accessToken,
        item.credentials?.access_token,
      );
      const hasIdentity = isPlainObject(item.user) || firstNonEmpty(
        item.email,
        item.name,
        item.label,
        item.meta?.label,
        item.tokens?.accountId,
        item.tokens?.account_id,
        item.tokens?.chatgptAccountId,
        item.tokens?.chatgpt_account_id,
        item.providerSpecificData?.chatgptAccountId,
        item.providerSpecificData?.chatgpt_account_id,
        item.id,
      );
      if (token && hasIdentity) {
        found.push({ value: item, sourceName, path });
        return;
      }

      for (const [key, child] of Object.entries(item)) {
        if (key === "accessToken" || key === "access_token" || key === "sessionToken") {
          continue;
        }
        visit(child, `${path}.${key}`);
      }
      return;
    }

    item.forEach((child, index) => visit(child, `${path}[${index}]`));
  }

  visit(value, "$");
  return found;
}

function parseInputDocuments(text) {
  if (typeof text !== "string" || text.trim() === "") {
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`JSON 解析失败：${error.message}`);
  }

  return collectSessionLikeObjects(parsed);
}

function convertSession(record, options = {}) {
  if (!isPlainObject(record)) {
    throw new Error("session 不是 JSON 对象");
  }

  const accessToken = firstNonEmpty(
    record.accessToken,
    record.access_token,
    record.tokens?.accessToken,
    record.tokens?.access_token,
    record.token?.accessToken,
    record.token?.access_token,
    record.credentials?.accessToken,
    record.credentials?.access_token,
  );
  if (!accessToken) {
    throw new Error("缺少 accessToken");
  }
  const sessionToken = firstNonEmpty(
    record.sessionToken,
    record.session_token,
    record.tokens?.sessionToken,
    record.tokens?.session_token,
    record.token?.sessionToken,
    record.token?.session_token,
    record.credentials?.session_token,
  );
  const refreshToken = firstNonEmpty(
    record.refreshToken,
    record.refresh_token,
    record.tokens?.refreshToken,
    record.tokens?.refresh_token,
    record.token?.refreshToken,
    record.token?.refresh_token,
    record.credentials?.refresh_token,
  );
  const inputIdToken = firstNonEmpty(
    record.idToken,
    record.id_token,
    record.tokens?.idToken,
    record.tokens?.id_token,
    record.token?.idToken,
    record.token?.id_token,
    record.credentials?.id_token,
  );

  const payload = parseJwtPayload(accessToken);
  const idPayload = parseJwtPayload(inputIdToken);
  const auth = getOpenAIAuthSection(payload);
  const idAuth = getOpenAIAuthSection(idPayload);
  const profile = getOpenAIProfileSection(payload);
  const hasRefreshToken = Boolean(refreshToken);
  const accessTokenExpiresAt = hasRefreshToken ? undefined : unixSecondsFromJwtExp(payload?.exp);
  const expiresAt = hasRefreshToken ? undefined : firstNonEmpty(
    payload ? timestampFromUnixSeconds(payload.exp) : undefined,
    normalizeTimestamp(record.expires),
    normalizeTimestamp(record.expiresAt),
    normalizeTimestamp(record.expired),
    normalizeTimestamp(record.expires_at),
  );
  const email = firstNonEmpty(
    record.user?.email,
    record.email,
    record.meta?.label,
    record.label,
    record.credentials?.email,
    record.providerSpecificData?.email,
    profile.email,
    idPayload?.email,
    payload?.email,
  );
  const accountId = firstNonEmpty(
    record.account?.id,
    record.account_id,
    record.tokens?.accountId,
    record.tokens?.account_id,
    record.chatgptAccountId,
    record.chatgpt_account_id,
    record.meta?.chatgptAccountId,
    record.meta?.chatgpt_account_id,
    record.tokens?.chatgptAccountId,
    record.tokens?.chatgpt_account_id,
    record.providerSpecificData?.chatgptAccountId,
    record.providerSpecificData?.chatgpt_account_id,
    record.credentials?.chatgpt_account_id,
    auth.chatgpt_account_id,
    idAuth.chatgpt_account_id,
    record.provider === "codex" ? record.id : undefined,
  );
  const chatgptAccountId = firstNonEmpty(
    record.chatgptAccountId,
    record.chatgpt_account_id,
    record.meta?.chatgptAccountId,
    record.meta?.chatgpt_account_id,
    record.tokens?.chatgptAccountId,
    record.tokens?.chatgpt_account_id,
    record.providerSpecificData?.chatgptAccountId,
    record.providerSpecificData?.chatgpt_account_id,
    record.credentials?.chatgpt_account_id,
    auth.chatgpt_account_id,
    idAuth.chatgpt_account_id,
  );
  const workspaceId = firstNonEmpty(
    record.account?.workspaceId,
    record.account?.workspace_id,
    record.workspaceId,
    record.workspace_id,
    record.meta?.workspaceId,
    record.meta?.workspace_id,
    record.providerSpecificData?.workspaceId,
    record.providerSpecificData?.workspace_id,
    record.credentials?.workspace_id,
    payload?.workspace_id,
    idPayload?.workspace_id,
  );
  const userId = firstNonEmpty(
    record.user?.id,
    record.user_id,
    record.chatgptUserId,
    record.providerSpecificData?.chatgptUserId,
    record.providerSpecificData?.chatgpt_user_id,
    auth.chatgpt_user_id,
    auth.user_id,
    idAuth.chatgpt_user_id,
    idAuth.user_id,
  );
  const planType = firstNonEmpty(
    record.account?.planType,
    record.account?.plan_type,
    record.planType,
    record.plan_type,
    record.providerSpecificData?.chatgptPlanType,
    record.providerSpecificData?.chatgpt_plan_type,
    record.credentials?.plan_type,
    auth.chatgpt_plan_type,
    idAuth.chatgpt_plan_type,
  );
  const exportedAt = normalizeTimestamp(options.now || new Date());
  const expiresIn = getExpiresIn(expiresAt, options.now || new Date());
  const sourceName = firstNonEmpty(options.sourceName, "pasted-json");
  const sourceType = record.provider === "codex" && record.authType === "oauth" ? "9router" : "chatgpt_web_session";
  const name = firstNonEmpty(email, sourceName, "ChatGPT Account");
  const syntheticIdToken = !inputIdToken
    ? buildSyntheticCodexIdToken(email, accountId, planType, userId, expiresAt)
    : undefined;
  const idToken = firstNonEmpty(inputIdToken, syntheticIdToken);

  const cpa = Object.fromEntries(Object.entries({
    type: "codex",
    account_id: accountId,
    chatgpt_account_id: accountId,
    email,
    name,
    plan_type: planType,
    chatgpt_plan_type: planType,
    id_token: idToken,
    id_token_synthetic: Boolean(syntheticIdToken) || undefined,
    access_token: accessToken,
    refresh_token: refreshToken || "",
    session_token: sessionToken,
    last_refresh: exportedAt,
    expired: expiresAt,
    disabled: Boolean(record.disabled) || undefined,
  }).filter(([, value]) => value !== undefined && value !== null));

  const cockpit = {
    type: "codex",
    id_token: idToken,
    access_token: accessToken,
    refresh_token: refreshToken || "",
    account_id: accountId,
    last_refresh: exportedAt,
    email,
    expired: expiresAt,
    account_note: firstNonEmpty(record.account_note, record.accountInfo, record.account_info, record.note, record.notes, record.remark),
  };

  const sub2apiAccount = stripUnavailable({
    name: firstNonEmpty(name, email, sourceName, "ChatGPT Account"),
    platform: "openai",
    type: "oauth",
    expires_at: accessTokenExpiresAt,
    auto_pause_on_expired: accessTokenExpiresAt ? true : undefined,
    concurrency: 10,
    priority: 1,
    credentials: {
      access_token: accessToken,
      chatgpt_account_id: accountId,
      chatgpt_user_id: userId,
      email,
      expires_at: expiresAt,
      expires_in: expiresIn,
      plan_type: planType,
    },
    extra: {
      email,
      email_key: toEmailKey(email),
      name,
      auth_provider: firstNonEmpty(record.authProvider, record.auth_provider),
      source: sourceType,
      last_refresh: exportedAt,
    },
  });
  const priority = Number.isFinite(Number(record.priority)) ? Number(record.priority) : 9;
  const isActive = typeof record.isActive === "boolean" ? record.isActive : !Boolean(record.disabled);
  const createdAt = normalizeTimestamp(record.createdAt) || exportedAt;
  const updatedAt = normalizeTimestamp(record.updatedAt) || exportedAt;
  const nineRouter = stripUnavailable({
    accessToken,
    refreshToken,
    expiresAt,
    testStatus: firstNonEmpty(record.testStatus, record.test_status, "active"),
    expiresIn,
    providerSpecificData: {
      chatgptAccountId: accountId,
      chatgptPlanType: planType,
    },
    id: accountId,
    provider: "codex",
    authType: "oauth",
    name,
    email,
    priority,
    isActive,
    createdAt,
    updatedAt,
  });
  const axonHubRefreshToken = refreshToken || AXONHUB_PLACEHOLDER_REFRESH_TOKEN;
  const codexAuthJson = {
    auth_mode: "chatgpt",
    OPENAI_API_KEY: null,
    tokens: {
      id_token: idToken,
      access_token: accessToken,
      refresh_token: refreshToken || "",
      account_id: accountId,
    },
    last_refresh: exportedAt,
  };
  const axonHub = stripUnavailable({
    auth_mode: "chatgpt",
    last_refresh: getAxonHubLastRefresh(expiresAt, options.now || new Date()),
    tokens: {
      access_token: accessToken,
      refresh_token: axonHubRefreshToken,
      id_token: idToken,
    },
    axonhub_refresh_token_placeholder: refreshToken ? undefined : true,
    axonhub_note: refreshToken ? undefined : "refresh_token is a placeholder; access_token works only until it expires.",
  });
  const codexManagerTokenHints = Object.fromEntries(Object.entries({
    account_id: accountId,
    chatgpt_account_id: chatgptAccountId,
  }).filter(([, value]) => value !== undefined && value !== null && value !== ""));
  const codexManagerMeta = Object.fromEntries(Object.entries({
    label: firstNonEmpty(name, email, sourceName, "ChatGPT Account"),
    workspace_id: workspaceId,
    chatgpt_account_id: chatgptAccountId,
    note: "Imported from ChatGPT session",
  }).filter(([, value]) => value !== undefined && value !== null && value !== ""));
  const codexManager = {
    tokens: {
      access_token: accessToken,
      refresh_token: refreshToken || "",
      id_token: inputIdToken || "",
      ...codexManagerTokenHints,
    },
    meta: codexManagerMeta,
  };

  return {
    sourceName,
    sourcePath: options.sourcePath,
    email,
    name,
    expiresAt,
    accessTokenExpiresAt,
    hasSyntheticIdToken: Boolean(syntheticIdToken),
    cpa,
    cockpit,
    nineRouter,
    codexAuthJson,
    axonHub,
    codexManager,
    sub2apiAccount,
  };
}
