import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import { inspect } from "../../../../tests/ui-helpers.mjs";
import { assertPlaneAlignment, preparePlaneAlignment } from "../../../../tests/ui-plane-alignment.mjs";
import { FixedStepCapture } from "./fixed-step-capture.mjs";
import { label, overlays } from "./overlays.mjs";

const output = path.resolve(process.argv[2] ?? ".cache/plane-alignment-demos");
await mkdir(output, { recursive: true });
const server = await createServer({ server: { port: 0, watch: null, hmr: false } });
const manifest = { method: "fixed-step browser clock; not live performance", clips: [] };
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  for (const construction of [false, true]) {
    const name = construction ? "construction-plane" : "coordinate-plane";
    const context = await browser.newContext({
      viewport: { width: 960, height: 640 }, reducedMotion: "no-preference",
    });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("dialog", (dialog) => dialog.dismiss());
      await page.clock.install();
      await page.goto(server.resolvedUrls.local[0]);
      await page.waitForFunction(() => !!window.makeshiftInspect);
      const { before, point } = await preparePlaneAlignment(page, construction);
      await overlays(page);
      await label(page, `Near 90° · ${construction ? "construction" : "coordinate"} plane`,
        "Double-click keeps the nearest quarter turn and takes the short path.");
      const capture = new FixedStepCapture(page, path.join(output, `${name}-frames`));
      await capture.start();
      await page.mouse.move(point.x, point.y);
      await capture.hold(1);
      await capture.action(() => page.mouse.dblclick(point.x, point.y));
      const after = await capture.action(() => inspect(page));
      assertPlaneAlignment(before, after, construction);
      await capture.hold(1);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: path.join(output, `${name}-preview.jpg`) });
      await writeFile(path.join(output, `${name}-state.json`), JSON.stringify({ before, after }, null, 2));
      const metadata = await capture.export(path.join(output, `${name}.mp4`));
      manifest.clips.push({ name, ...metadata });
      await writeFile(path.join(output, "manifest.json"), JSON.stringify(manifest, null, 2));
      console.log(`Exported ${name}: ${metadata.frames} frames`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser?.close();
  await server.close();
}
