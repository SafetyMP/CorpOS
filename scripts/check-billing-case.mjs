// Build the console first with npm run build -w @corpos/console.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { preview } from "vite";

const server = await preview({
  configFile: false,
  root: fileURLToPath(new URL("../apps/console", import.meta.url)),
  preview: { host: "127.0.0.1", port: 0, strictPort: true },
});
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  });
  const address = server.httpServer.address();
  assert.ok(address && typeof address === "object");
  for (const width of [1280, 375]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.getByRole("heading", { name: "One credit. Three teams.", exact: true }).waitFor();
    assert.equal(
      await page.locator(".investigation-receipt,.probe-chart,.case-reading").count(),
      0,
    );
    assert.equal(await page.locator(".observation-desk, .mandate-replay, #pilot").count(), 0);
    assert.equal(await page.locator(".framework-map li").count(), 3);
    await page.getByRole("button", { name: "Open Ada’s case file" }).press("Enter");
    assert.equal(await page.getByRole("radio", { name: "Cast an approval vote" }).count(), 0);
    await page.getByRole("button", { name: "Refund ledger" }).click();
    assert.match(await page.locator(".ledger-observation").innerText(), /Settled/);
    await page.getByRole("link", { name: "Trace the refund on the work contract" }).click();
    assert.match(await page.locator(".trace-inspector").innerText(), /billing.issue_refund/);
    await page
      .getByRole("link", { name: /Return to your billing case/ })
      .first()
      .click();
    await page.getByRole("radio", { name: "Trace Ada’s credit" }).check();
    await page.getByRole("radio", { name: "Reject the request" }).check();
    await page.getByRole("button", { name: "Service samples" }).click();
    assert.equal(await page.locator(".investigation-receipt, .mandate-replay, #pilot").count(), 0);
    await page.getByRole("link", { name: "Trace this case" }).click();
    assert.match(await page.locator(".trace-context").innerText(), /Awaiting operator decision/);
    await page
      .getByRole("link", { name: /Return to your billing case/ })
      .first()
      .click();
    await page.getByRole("radio", { name: "Trace Ada’s credit" }).check();
    assert.match(await page.locator(".investigation-receipt").innerText(), /usual/);
    await page.getByLabel("Service capture").selectOption("B");
    assert.equal(await page.locator(".investigation-receipt").count(), 0);
    await page.getByRole("radio", { name: "Page the incident lead" }).check();
    await page.getByRole("radio", { name: "Cast an approval vote" }).check();
    await page.getByRole("button", { name: "Model a second eligible vote" }).click();
    await page.getByLabel("Cross-team handoffs").selectOption("approve");
    assert.match(await page.locator(".mandate-receipt").innerText(), /3 of 6/);
    await page.getByRole("button", { name: "10 minutes saved" }).click();
    await page.getByRole("radio", { name: "Fund a 30-day shadow pilot" }).check();
    assert.match(await page.locator("#pilot .case-reading").innerText(), /\$900/);
    if (process.env.CORPOS_SCREENSHOT_DIR)
      await page.screenshot({
        path: `${process.env.CORPOS_SCREENSHOT_DIR}/corpos-billing-restored-${width}.png`,
        fullPage: true,
      });
    await page.getByRole("link", { name: "Trace this case" }).click();
    await page.getByRole("heading", { name: "Trace the billing restart" }).waitFor();
    assert.match(await page.locator(".trace-context").innerText(), /1 \/ 9 \/ 18 failures per 100/);
    assert.match(await page.locator(".trace-context").innerText(), /Billing incident lead/);
    assert.match(await page.locator(".trace-context").innerText(), /Two voters/);
    await page.getByRole("button", { name: /Request 4, Finance/ }).click();
    assert.match(await page.locator(".trace-inspector").innerText(), /billing.issue_refund/);
    await page.getByRole("button", { name: "Policy decision", exact: true }).click();
    await page.getByLabel("Request on the contract").selectOption("3");
    assert.match(await page.locator(".policy-rail").innerText(), /Human review/);
    await page.getByRole("button", { name: "Execution gate", exact: true }).click();
    await page.getByRole("button", { name: "Distinct voters", exact: true }).click();
    assert.match(await page.locator(".trial-result").innerText(), /runs the simulated restart/);
    await page.getByRole("button", { name: "Stop before vote two", exact: true }).click();
    assert.match(await page.locator(".trial-result").innerText(), /denies the restart/);
    await page.locator(".trial-audit summary").click();
    assert.match(
      await page.locator(".trial-audit").innerText(),
      /exception.approved.*gateway.decision/s,
    );
    const link = await page
      .getByRole("link", { name: "Bookmark this comparison" })
      .getAttribute("href");
    assert.equal(link, new URL(page.url()).hash);
    await page.reload();
    assert.equal(
      await page.getByRole("button", { name: "Execution gate" }).getAttribute("aria-pressed"),
      "true",
    );
    assert.match(await page.locator(".trial-result").innerText(), /denies the restart/);
    if (process.env.CORPOS_SCREENSHOT_DIR)
      await page.screenshot({
        path: `${process.env.CORPOS_SCREENSHOT_DIR}/corpos-selected-trace-${width}.png`,
        fullPage: true,
      });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    await page
      .getByRole("link", { name: /Return to your billing case/ })
      .first()
      .click();
    assert.equal(
      await page.getByRole("radio", { name: "Fund a 30-day shadow pilot" }).isChecked(),
      true,
    );
    assert.equal(await page.getByLabel("Net minutes saved per case").inputValue(), "10");
    assert.equal(await page.getByLabel("Service capture").inputValue(), "B");
    await page.getByRole("radio", { name: "Reject the request" }).check();
    await page.getByRole("link", { name: "Trace this case" }).click();
    assert.match(await page.locator(".trace-context").innerText(), /Rejected/);
    await page.goBack();
    await page.getByRole("heading", { name: "One credit. Three teams.", exact: true }).waitFor();
    assert.equal(await page.getByRole("radio", { name: "Reject the request" }).isChecked(), true);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    "Desktop and mobile incident evidence, sponsor economics, trial differences, bookmarks and back navigation passed.",
  );
} finally {
  await browser?.close();
  await new Promise((resolve, reject) =>
    server.httpServer.close((err) => (err ? reject(err) : resolve())),
  );
}
