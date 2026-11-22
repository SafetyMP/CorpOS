// From the repo root: npm run build -w @corpos/console && node scripts/check-billing-case.mjs
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { preview } from "vite";

const server = await preview({
  configFile: false,
  root: fileURLToPath(new URL("../apps/console", import.meta.url)),
  preview: { host: "127.0.0.1", port: 0 },
});
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  });
  const page = await browser.newPage();
  const address = server.httpServer.address();
  assert.ok(address && typeof address === "object");
  await page.goto(`http://127.0.0.1:${address.port}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Billing handoff", exact: true }).waitFor();
  assert.equal(await page.locator(".investigation-receipt, .case-reading").count(), 0);
  assert.equal(await page.locator(".probe-chart").count(), 0);
  const samples = page.getByRole("button", { name: "Service samples", exact: true });
  const capture = page.getByLabel("Service capture");
  const payments = page.getByRole("radio", { name: "Trace Ada’s credit" });
  const vote = page.getByRole("radio", { name: "Cast an approval vote" });
  const ledger = page.getByRole("button", { name: "Refund ledger", exact: true });
  await ledger.click();
  const originalLedger = await page.locator(".ledger-observation").innerText();
  await samples.click();
  await payments.check();
  assert.match(await page.locator(".investigation-receipt").innerText(), /usual one to two/);
  await capture.selectOption("B");
  assert.equal(await page.locator(".investigation-receipt").count(), 0);
  await payments.check();
  assert.match(
    await page.locator(".investigation-receipt").innerText(),
    /without an incident owner/,
  );
  await vote.check();
  for (const record of [/Support Check Ada/, /Finance Issue/]) {
    await page.getByRole("button", { name: record }).click();
    await page.getByRole("button", { name: "Review Ops request" }).click();
    assert.equal(await capture.inputValue(), "B");
    assert.equal(await payments.isChecked(), true);
    assert.equal(await vote.isChecked(), true);
    assert.match(await page.locator(".ops-state").innerText(), /1 of 2 votes/);
  }
  await ledger.click();
  assert.equal(await page.locator(".ledger-observation").innerText(), originalLedger);
  await samples.click();
  await page.getByRole("button", { name: "Model a second eligible vote" }).click();
  await capture.selectOption("A");
  assert.equal(await payments.isChecked(), false);
  assert.equal(await vote.isChecked(), false);
  assert.equal(
    await page.locator(".case-reading, .investigation-receipt, .vote-recorded").count(),
    0,
  );
  assert.equal(await page.locator(".ops-state").innerText(), "Queued for review");
  console.log("Billing case observation, routing, navigation and replay checks passed.");
} finally {
  await browser?.close();
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
