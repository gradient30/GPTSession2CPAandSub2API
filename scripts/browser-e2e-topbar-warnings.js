#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const DOCS_DIR = path.join(ROOT, "docs");
const PORT = 4173;

function fail(message) {
  console.error(`browser-e2e-topbar-warnings: ${message}`);
  process.exit(1);
}

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const urlPath = decodeURIComponent((request.url || "/").split("?")[0]);
      const relativePath = urlPath === "/" ? "/index.html" : urlPath;
      const filePath = path.join(DOCS_DIR, relativePath);

      if (!filePath.startsWith(DOCS_DIR)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }

      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }

      const ext = path.extname(filePath);
      const type =
        ext === ".html"
          ? "text/html; charset=utf-8"
          : ext === ".svg"
            ? "image/svg+xml"
            : "application/octet-stream";

      response.writeHead(200, { "Content-Type": type });
      response.end(fs.readFileSync(filePath));
    });

    server.on("error", reject);
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

async function loadPlaywright() {
  try {
    return require("playwright");
  } catch {
    fail("playwright is required. Run: npm install --save-dev playwright@1.49.1");
  }
}

async function assertTopbarWarnings(page) {
  const warnings = page.locator("#synthetic-warnings");
  await warnings.waitFor({ state: "visible", timeout: 5000 });

  const text = await warnings.innerText();
  assert.match(text, /合成 id_token/);
  assert.match(text, /refresh_token 占位值/);

  const titleBox = await page.locator("#breadcrumb-current").boundingBox();
  const warningsBox = await warnings.boundingBox();
  const topbarBox = await page.locator("#terra-topbar").boundingBox();

  assert.ok(titleBox, "title bounding box missing");
  assert.ok(warningsBox, "warnings bounding box missing");
  assert.ok(topbarBox, "topbar bounding box missing");
  assert.ok(warningsBox.width > 80, "warnings width too small");
  assert.ok(warningsBox.height > 16, "warnings height too small");
  assert.ok(
    warningsBox.y >= topbarBox.y && warningsBox.y + warningsBox.height <= topbarBox.y + topbarBox.height + 4,
    "warnings should stay inside the top bar",
  );
  assert.ok(
    warningsBox.x > titleBox.x,
    "warnings should appear to the right of the title",
  );

  const color = await warnings.evaluate((node) => getComputedStyle(node).color);
  assert.ok(/rgb\(168, 50, 50\)|rgb\(240, 128, 128\)/.test(color), `expected red warning color, got ${color}`);
}

async function main() {
  const { chromium } = await loadPlaywright();
  const server = await startStaticServer();
  const browser = await chromium.launch({ headless: true });

  try {
    pageLoop: for (const viewportWidth of [1440, 900]) {
      const page = await browser.newPage({ viewport: { width: viewportWidth, height: 900 } });
      page.on("dialog", (dialog) => dialog.accept());

      try {
        await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });

        await page.locator("#load-example").click();
        await page.locator('[data-format="axonhub"]').click();
        await assertTopbarWarnings(page);

        await page.locator("#clear-input").click();
        await page.locator('[data-format="sub2api"]').click();
        await page.locator("#session-input").fill(
          JSON.stringify({
            user: { email: "mark@example.com" },
            account: { id: "00000000-0000-4000-9000-000000000000", planType: "plus" },
            accessToken: "access-token-value",
            sessionToken: "session-token-value",
          }),
        );
        await page.locator("#session-input").dispatchEvent("input");
        await page.locator('[data-format="axonhub"]').click();
        await assertTopbarWarnings(page);
      } finally {
        await page.close();
      }
    }

    console.log("browser-e2e-topbar-warnings: passed");
  } finally {
    await browser.close();
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
