#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const HTML_PATH = path.join(ROOT, "docs", "index.html");

function fail(message) {
  console.error(`browser-csp-audit: ${message}`);
  process.exit(1);
}

function extractInlineScript(html) {
  const match = html.match(/<script>\s*([\s\S]*?)\s*<\/script>\s*<\/body>/);
  if (!match) {
    fail("missing inline script");
  }
  return match[1];
}

function main() {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const script = extractInlineScript(html);

  const checks = [
    ["no external script src", !/<script[^>]+src=/i.test(html)],
    ["no inline event handlers", !/\son[a-z]+\s*=/i.test(html)],
    ["no external stylesheet", !/<link[^>]+rel=["']stylesheet["'][^>]+href=["']https?:/i.test(html)],
    ["no XMLHttpRequest in script", !/XMLHttpRequest/.test(script)],
    ["no WebSocket in script", !/WebSocket/.test(script)],
    ["no sendBeacon in script", !/sendBeacon/.test(script)],
    ["csp connect-src chatgpt only", html.includes("connect-src https://chatgpt.com")],
    ["session fetch uses chatgpt url only", /fetch\(CHATGPT_SESSION_URL/.test(script)],
    ["favicon is local", /href="\.\/favicon\.svg"/.test(html)],
  ];

  for (const [label, ok] of checks) {
    if (!ok) {
      fail(`check failed: ${label}`);
    }
  }

  console.log("browser-csp-audit: static Network/CSP checks passed");
}

main();
