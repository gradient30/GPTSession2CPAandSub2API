function buildSub2apiDocument(converted, now = new Date()) {
  return {
    exported_at: normalizeTimestamp(now),
    proxies: [],
    accounts: converted.map((item) => item.sub2apiAccount),
  };
}

function buildOutputDocument(format, converted, now = new Date()) {
  if (format === "sub2api") {
    return buildSub2apiDocument(converted, now);
  }

  if (format === "cpa") {
    return converted.length === 1
      ? converted[0].cpa
      : converted.map((item) => item.cpa);
  }

  if (format === "cockpit") {
    return converted.length === 1
      ? converted[0].cockpit
      : converted.map((item) => item.cockpit);
  }

  if (format === "9router") {
    return converted.length === 1
      ? converted[0].nineRouter
      : converted.map((item) => item.nineRouter);
  }

  if (format === "codex") {
    return converted.length === 1
      ? converted[0].codexAuthJson
      : converted.map((item) => item.codexAuthJson);
  }

  if (format === "axonhub") {
    return converted.length === 1
      ? converted[0].axonHub
      : converted.map((item) => item.axonHub);
  }

  if (format === "codexmanager") {
    return converted.length === 1
      ? converted[0].codexManager
      : converted.map((item) => item.codexManager);
  }

  return buildSub2apiDocument(converted, now);
}

function convertFromText(text, state) {
  const sources = parseInputDocuments(text);
  const converted = [];
  const skipped = [];
  const now = new Date();

  sources.forEach((item, index) => {
    try {
      converted.push(convertSession(item.value, {
        now,
        sourceName: item.sourceName,
        sourcePath: item.path || `$[${index}]`,
      }));
    } catch (error) {
      skipped.push({
        sourceName: item.sourceName,
        path: item.path,
        reason: error instanceof Error ? error.message : "无法转换",
      });
    }
  });

  if (!sources.length) {
    skipped.push({
      sourceName: "pasted-json",
      path: "$",
      reason: "未找到包含 accessToken 和 user/email 的 session 对象",
    });
  }

  state.converted = converted;
  state.skipped = skipped;
  state.sessions = sources;
  updateOutput();
}
