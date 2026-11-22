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
    await page.getByRole("heading", { name: "Who signs for the agent?" }).waitFor();
    assert.deepEqual(
      await page
        .locator(".trace-lane")
        .evaluateAll((lanes) =>
          lanes.map((lane) => [lane.dataset.team, lane.querySelectorAll("button").length]),
        ),
      [
        ["Support", 3],
        ["Finance", 2],
        ["Operations", 1],
      ],
    );
    const proof = page.getByRole("region", { name: "Replay proof" });
    assert.equal(await proof.count(), 0);
    await page.getByRole("button", { name: /Assign Finance/ }).click();
    assert.match(await page.locator(".trace-inspector").innerText(), /transfers the obligation/);
    await page.getByLabel("Cross-team handoffs").selectOption("approve");
    await page.getByLabel("Shared-service restarts").selectOption("deny");
    await page.getByRole("button", { name: "Replay six requests" }).click();
    assert.match(await proof.innerText(), /3 of 6 dispositions changed/);
    assert.match(
      await page.locator(".review-cost").innerText(),
      /2 requests would need human review/,
    );
    assert.match(await page.locator(".review-cost").innerText(), /1 would be denied/);
    await page.getByRole("button", { name: "Take proposal to pilot" }).click();
    assert.match(await page.locator(".filed").innerText(), /2 of 6 requests/);
    await page.getByRole("button", { name: "Keep recorded policy" }).click();
    assert.match(await page.locator(".filed").innerText(), /1 of 6 requests/);
    await page.getByRole("link", { name: "Technical reference" }).click();
    await page.getByRole("heading", { name: "Inside the policy replay" }).waitFor();
    assert.equal(await page.getByRole("link", { name: "Open ops console" }).count(), 0);
    await page.getByRole("link", { name: "Delegation desk" }).click();
    assert.match(await page.locator(".filed").innerText(), /Recorded mandate/);
    await page.getByLabel("Refund requests").selectOption("approve");
    assert.equal(await proof.count(), 0);
    await page.getByRole("button", { name: "Replay six requests" }).click();
    assert.match(await proof.innerText(), /4 of 6 dispositions changed/);
    if (process.env.CORPOS_SCREENSHOT_DIR)
      await page.screenshot({
        path: `${process.env.CORPOS_SCREENSHOT_DIR}/corpos-delegation-${width}.png`,
        fullPage: true,
      });
    await page.getByRole("button", { name: "Reset to recorded rules" }).click();
    assert.equal(await proof.count(), 0);
    await page.getByRole("button", { name: "Replay six requests" }).click();
    assert.match(await proof.innerText(), /0 of 6 dispositions changed/);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
    );
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("Desktop and mobile delegation replays, signoff, navigation and reset passed.");
} finally {
  await browser?.close();
  await new Promise((resolve, reject) =>
    server.httpServer.close((err) => (err ? reject(err) : resolve())),
  );
}
