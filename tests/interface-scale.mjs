import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { settled } from "./ui-helpers.mjs";
import { changeScale, geometryScaleRoute, preferencesRoute } from "./ui-interface-scale.mjs";
import { runtimeNames } from "./ui-runtime.mjs";
import { installTestFrames } from "./ui-test-frames.mjs";

const server = await createServer({ server: { port: 0 } });
await server.listen();
await mkdir(".cache/sketch-review", { recursive: true });
try {
  for (const name of runtimeNames(["chromium", "webkit"])) {
    const engine = { chromium, webkit }[name];
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 2,
      });
      await installTestFrames(page);
      page.setDefaultTimeout(30000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(server.resolvedUrls.local[0]);
      await settled(page);
      await preferencesRoute(page);
      console.log(`${name}: preferences and reset passed; beginning geometry routes`);
      try {
        for (const scale of [0.8, 1.5]) await geometryScaleRoute(page, scale, name);
      } catch (error) {
        await page.screenshot({ path: `.cache/sketch-review/${name}-interface-scale-failure.png` });
        console.log(
          await page.evaluate(() => {
            const state = window.makeshiftInspect();
            return {
              bodyCount: state.document.bodies?.length,
              previewCount: state.preview?.bodies?.length,
              interaction: state.interaction,
              tool: state.modelingTool,
              status: document.querySelector(".status")?.textContent,
            };
          }),
        );
        throw error;
      }
      await page.setViewportSize({ width: 820, height: 1000 });
      await changeScale(page, 1.5);
      const settings = await page.locator(".settings-trigger").boundingBox();
      assert.ok(
        settings.x >= 0 && settings.x + settings.width <= 820 && settings.y + settings.height < 250,
        `Settings stays inside the narrow header: ${JSON.stringify(settings)}`,
      );
      await page.screenshot({ path: `.cache/sketch-review/${name}-interface-scale-narrow.png` });
      assert.deepEqual(errors, []);
      console.log(
        `${name}: six preferences, reset/reload, high-DPI 80/150% sketch/solid edits, Tools/dialogs, picking and camera passed`,
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}
