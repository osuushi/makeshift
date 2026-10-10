import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { createServer } from "vite";

// The media handoff, lazy loading and carousel controls are a browser integration.
const server = await createServer({
  configFile: false,
  root: "website",
  server: { port: 0, host: "127.0.0.1" },
});
await mkdir(".cache/landing-review", { recursive: true });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0]);
  const gallery = page.getByRole("region", { name: "Makeshift feature demos" });
  await gallery.scrollIntoViewIfNeeded();
  assert.equal(await page.locator(".demo-slide").count(), 7);
  assert.equal(
    await page.locator("video").evaluateAll((videos) => videos.every((v) => v.paused)),
    true,
  );
  await page.getByRole("button", { name: "Next demo", exact: true }).click();
  assert.equal(
    await page.getByRole("button", { name: "Sketching", exact: true }).getAttribute("aria-pressed"),
    "true",
  );
  await page.getByRole("button", { name: "Sketching", exact: true }).press("ArrowRight");
  assert.equal(
    await page.getByRole("button", { name: "Extrude", exact: true }).getAttribute("aria-pressed"),
    "true",
  );
  await page.getByRole("button", { name: "Play demos", exact: true }).click();
  await page.waitForFunction(() => {
    const video = document.querySelectorAll("video")[2];
    return !video.paused && video.currentTime > 0;
  });
  await page.getByRole("button", { name: "Pause demos", exact: true }).click();
  assert.equal(
    await page.locator("video").evaluateAll((videos) => videos.every((v) => v.paused)),
    true,
  );
  await page.getByRole("button", { name: "Play demos", exact: true }).click();
  await page
    .locator("video")
    .nth(2)
    .evaluate((video) => {
      video.currentTime = video.duration - 0.15;
    });
  await page.waitForFunction(
    () => document.querySelector('[data-slide="3"]').getAttribute("aria-pressed") === "true",
  );
  await page.getByRole("button", { name: "Pause demos", exact: true }).click();
  await page.locator(".demo-window").scrollIntoViewIfNeeded();
  const box = await page.locator(".demo-window").boundingBox();
  await page.mouse.move(box.x + box.width * 0.6, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, box.y + 100, { steps: 6 });
  await page.mouse.up();
  assert.equal(
    await page
      .getByRole("button", { name: "Fillet & chamfer", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  // Every generated clip must decode, including those initially lazy-loaded.
  for (let i = 0; i < 7; i++) {
    await page.locator("[data-slide]").nth(i).click();
    await page.getByRole("button", { name: "Play demos", exact: true }).click();
    await page.waitForFunction((index) => {
      const v = document.querySelectorAll("video")[index];
      return v.readyState >= 2 && v.currentTime > 0;
    }, i);
    await page.getByRole("button", { name: "Pause demos", exact: true }).click();
  }
  for (const width of [390, 787, 1280, 1920]) {
    await page.setViewportSize({ width, height: 983 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    await page.screenshot({ path: `.cache/landing-review/gallery-${width}.png`, fullPage: true });
  }
  assert.deepEqual(errors, []);
  console.log(
    "Gallery: reduced motion, navigation, keyboard, playback, seven decoded clips and responsive layout passed",
  );
} finally {
  await browser?.close();
  await server.close();
}
