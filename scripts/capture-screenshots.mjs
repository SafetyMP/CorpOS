/**
 * Capture README screenshots and demo GIF from the CorpOS ops console.
 *
 * Usage:
 *   npm run build && npm run start   # console on :3000
 *   npm run screenshots
 *
 * Rebuild GIF only from existing PNGs (no browser):
 *   npm run screenshots:rebuild-gif
 *
 * Optional: SCREENSHOT_BASE_URL=http://localhost:3000 npm run screenshots
 *
 * CI: set CI=1 to use bundled Chromium instead of system Chrome.
 */
import { chromium } from "playwright";
import gifenc from "gifenc";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const { GIFEncoder, quantize, applyPalette } = gifenc;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const outDir = path.join(repoRoot, "docs", "assets");
const baseUrl = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3000";

/** Named PNG stills kept for README table + rebuild-gif fallback. */
const stills = [
  { file: "ops.png", name: "Ops" },
  { file: "ops-day.png", name: "Company day" },
  { file: "governor.png", name: "Governor" },
];

const GIF_FRAME_DELAY_MS = 1_200;

function launchOptions() {
  if (process.env.CI) {
    return { headless: true };
  }
  return { channel: "chrome", headless: true };
}

async function writeDemoGif(gifFrames) {
  const encoder = GIFEncoder();
  for (const { buffer, name } of gifFrames) {
    const { data, width, height } = PNG.sync.read(buffer);
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    encoder.writeFrame(index, width, height, { palette, delay: GIF_FRAME_DELAY_MS });
    console.log(`GIF frame: ${name}`);
  }
  encoder.finish();
  const gifPath = path.join(outDir, "demo.gif");
  await writeFile(gifPath, Buffer.from(encoder.bytes()));
  console.log("Captured demo GIF -> docs/assets/demo.gif");
}

async function rebuildGifFromExisting() {
  await mkdir(outDir, { recursive: true });
  const gifFrames = [];
  for (const { file, name } of stills) {
    const buffer = await readFile(path.join(outDir, file));
    gifFrames.push({ buffer, name });
    console.log(`Loaded ${name} -> docs/assets/${file}`);
  }
  await writeDemoGif(gifFrames);
}

async function saveShot(page, file, name) {
  await page.waitForTimeout(400);
  const buffer = await page.screenshot({ fullPage: false });
  if (file) {
    const dest = path.join(outDir, file);
    await writeFile(dest, buffer);
    console.log(`Captured ${name} -> docs/assets/${file}`);
  } else {
    console.log(`Captured GIF-only frame: ${name}`);
  }
  return buffer;
}

async function captureLive() {
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch(launchOptions());
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Autonomous company ops" }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
  await page.getByRole("heading", { name: "Capital" }).waitFor({ state: "visible" });

  const gifFrames = [];

  const opsBuffer = await saveShot(page, "ops.png", "Ops idle");
  gifFrames.push({ buffer: opsBuffer, name: "Ops idle" });

  await page.getByRole("button", { name: "Run company day" }).click();
  await page.locator("[data-company-day]").waitFor({ state: "visible", timeout: 30_000 });

  // Capture progressive agent activity as the timeline stage-reveals.
  const beatKinds = ["handoff", "autonomous_settle", "exception", "trust", "sla"];
  for (const kind of beatKinds) {
    await page.locator(`[data-timeline-kind="${kind}"]`).first().waitFor({
      state: "visible",
      timeout: 30_000,
    });
    const buffer = await saveShot(page, null, `Activity ${kind}`);
    gifFrames.push({ buffer, name: `Activity ${kind}` });
  }

  await page
    .locator('[data-company-day="complete"]')
    .waitFor({ state: "visible", timeout: 30_000 });
  const dayBuffer = await saveShot(page, "ops-day.png", "Company day complete");
  gifFrames.push({ buffer: dayBuffer, name: "Company day complete" });

  await page.getByRole("button", { name: "Governor" }).click();
  await page.getByRole("heading", { name: "Governor" }).waitFor({ state: "visible" });
  const govBuffer = await saveShot(page, "governor.png", "Governor");
  gifFrames.push({ buffer: govBuffer, name: "Governor" });

  await writeDemoGif(gifFrames);
  await browser.close();
}

async function main() {
  if (process.argv.includes("--from-existing")) {
    await rebuildGifFromExisting();
    return;
  }
  await captureLive();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
