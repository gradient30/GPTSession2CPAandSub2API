#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const TEMPLATE_PATH = path.join(ROOT, "src", "template.html");
const OUTPUT_PATH = path.join(ROOT, "docs", "index.html");
const PACKAGE_PATH = path.join(ROOT, "package.json");

const SCRIPT_FILES = [
  "src/lib/constants.js",
  "src/lib/utils.js",
  "src/lib/converter.js",
  "src/lib/formats.js",
  "src/lib/sensitive.js",
  "src/app.js",
].map((relativePath) => path.join(ROOT, relativePath));

function readPackageVersion() {
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_PATH, "utf8"));
  return pkg.version;
}

function buildScriptBody() {
  const chunks = SCRIPT_FILES.map((filePath) => {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing source file: ${filePath}`);
    }
    return fs.readFileSync(filePath, "utf8").trim();
  });

  return `(() => {\n${chunks.join("\n\n")}\n})();`;
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function buildDateUtc() {
  return new Date().toISOString().slice(0, 10);
}

function main() {
  const version = readPackageVersion();
  const buildDate = buildDateUtc();
  const scriptBody = buildScriptBody();
  const scriptSha256 = sha256Hex(scriptBody);
  const scriptSha256Short = scriptSha256.slice(0, 12);

  let html = fs.readFileSync(TEMPLATE_PATH, "utf8");
  html = html
    .replace(/<!-- BUILD:VERSION -->/g, version)
    .replace(/<!-- BUILD:DATE -->/g, buildDate)
    .replace(/<!-- BUILD:SHA256 -->/g, scriptSha256Short)
    .replace(/<!-- BUILD:SHA256_FULL -->/g, scriptSha256)
    .replace("<!-- INJECT_SCRIPT -->", `<script>\n${scriptBody}\n    </script>`);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, html, "utf8");

  const sumsPath = path.join(ROOT, "dist", "SHA256SUMS");
  fs.mkdirSync(path.dirname(sumsPath), { recursive: true });
  const pageSha256 = sha256Hex(html);
  fs.writeFileSync(
    sumsPath,
    `${pageSha256}  docs/index.html\n${scriptSha256}  inline-script\n`,
    "utf8",
  );

  console.log(`Built docs/index.html (v${version}, ${buildDate})`);
  console.log(`Script SHA256: ${scriptSha256}`);
  console.log(`Page SHA256:   ${pageSha256}`);
}

main();
