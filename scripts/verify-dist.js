#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const HTML_PATH = path.join(ROOT, "docs", "index.html");
const PACKAGE_PATH = path.join(ROOT, "package.json");

function fail(message) {
  console.error(`verify-dist: ${message}`);
  process.exit(1);
}

function main() {
  if (!fs.existsSync(HTML_PATH)) {
    fail("docs/index.html is missing. Run npm run build first.");
  }

  const requiredFiles = [
    "SECURITY.md",
    "docs/RELEASE.md",
    "docs/AUDIT_CHECKLIST.md",
    "src/template.html",
    "src/lib/converter.js",
    "dist/SHA256SUMS",
  ];

  for (const relativePath of requiredFiles) {
    if (!fs.existsSync(path.join(ROOT, relativePath))) {
      fail(`missing required file: ${relativePath}`);
    }
  }

  const template = fs.readFileSync(path.join(ROOT, "src", "template.html"), "utf8");
  if (!template.includes("<!-- INJECT_SCRIPT -->")) {
    fail("src/template.html missing INJECT_SCRIPT placeholder");
  }

  const html = fs.readFileSync(HTML_PATH, "utf8");
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_PATH, "utf8"));

  const checks = [
    ["doctype declaration", html.startsWith("<!DOCTYPE html>")],
    ["build version meta", html.includes(`content="v${pkg.version}"`)],
    ["CSP meta", html.includes("Content-Security-Policy")],
    ["connect-src none", html.includes("connect-src 'none'")],
    ["build sha256 meta", /name="build-sha256" content="[a-f0-9]{12}"/.test(html)],
    ["no pending sha placeholder", !html.includes("pending-build")],
    ["drag-drop handler", html.includes("dragover") && html.includes("readFiles(event.dataTransfer.files)")],
    ["sensitive consent", html.includes("ensureSensitiveConsent")],
    ["escapeHtml", html.includes("function escapeHtml")],
    ["no discord promo card", !html.includes("discord-card")],
    ["synthetic warnings ui", html.includes("synthetic-warnings")],
    ["clear-input warning style", html.includes("button-warning")],
    ["no external script src", !/<script[^>]+src=/i.test(html)],
  ];

  for (const [label, ok] of checks) {
    if (!ok) {
      fail(`check failed: ${label}`);
    }
  }

  const testRun = spawnSync(process.execPath, ["tests/convert-session.test.js"], {
    cwd: ROOT,
    encoding: "utf8",
  });

  if (testRun.status !== 0) {
    process.stdout.write(testRun.stdout || "");
    process.stderr.write(testRun.stderr || "");
    fail("tests failed during verify");
  }

  console.log("verify-dist: all checks passed");
}

main();
