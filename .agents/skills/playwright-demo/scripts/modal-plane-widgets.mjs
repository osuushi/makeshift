import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import { orient } from "../../../../tests/ui-blend-edit.mjs";
import { worldClick } from "../../../../tests/ui-face-offset.mjs";
import { inspect, settled } from "../../../../tests/ui-helpers.mjs";
import {
  chooseWidget,
  seedWidgetBody,
  widgetPoint,
} from "../../../../tests/ui-modal-plane-widgets.mjs";
import { chooseTool } from "../../../../tests/ui-tools.mjs";
import { FixedStepCapture } from "./fixed-step-capture.mjs";
import { label, overlays } from "./overlays.mjs";

const output = path.resolve(process.argv[2] ?? ".cache/plane-demos/modal-widgets");
await mkdir(output, { recursive: true });
const server = await createServer({ server: { port: 0, watch: null, hmr: false } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 960, height: 640 } });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.dismiss());
    await page.clock.install();
    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForFunction(() => !!window.makeshiftInspect);
    await seedWidgetBody(page);
    await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
    const original = (await inspect(page)).document;
    await chooseTool(page, "Split Body", "split");
    await overlays(page);
    const capture = new FixedStepCapture(page, path.join(output, "frames"));
    await capture.start();
    await label(
      page,
      "Plane references above the body",
      "Three faint rectangles stay near the origin during modal plane picking.",
    );
    await capture.hold(1.3);
    await page.screenshot({ path: path.join(output, "01-occluded-widgets.png") });
    await label(
      page,
      "Orbit and zoom",
      "Plane alignment follows the view; pixel size and origin offset stay consistent.",
    );
    const p = await widgetPoint(page, "YZ");
    await page.mouse.move(p.x, p.y);
    await page.keyboard.down("Meta");
    await page.mouse.down();
    for (let i = 1; i <= 45; i++) {
      await page.mouse.move(p.x + (150 * i) / 45, p.y + (70 * i) / 45);
      await capture.frame();
    }
    await page.mouse.up();
    await page.keyboard.up("Meta");
    await capture.action(() => settled(page));
    await page.keyboard.down("Control");
    for (let i = 0; i < 18; i++) {
      await page.mouse.wheel(0, -3);
      await capture.frame();
    }
    await page.keyboard.up("Control");
    await capture.action(() => settled(page));
    await capture.hold(0.7);
    await capture.action(() => orient(page, [1, -1, 1]));
    await label(
      page,
      "Split with YZ",
      "Click the rectangle through occluding body geometry, then accept the exact preview.",
    );
    await capture.action(() => chooseWidget(page, "YZ"));
    assert.equal((await capture.action(() => inspect(page))).preview.bodies.length, 2);
    await capture.hold(1.1);
    await page.screenshot({ path: path.join(output, "02-split-preview.png") });
    await capture.action(() => page.keyboard.press("Enter"));
    assert.equal((await capture.action(() => inspect(page))).document.bodies.length, 2);
    await capture.hold(0.7);
    await capture.action(() => chooseTool(page, "undo", "undo"));
    assert.deepEqual((await capture.action(() => inspect(page))).document, original);
    await capture.action(() => page.keyboard.press("Escape"));
    await capture.action(() => worldClick(page, [0, 0, 20]));
    await capture.action(() => chooseTool(page, "Imprint", "imprint"));
    await label(
      page,
      "Imprint a selected face",
      "The same reference picker creates exact section edges. Escape restores the original selection.",
    );
    await capture.action(() => chooseWidget(page, "YZ"));
    assert.equal((await capture.action(() => inspect(page))).preview.bodies[0].faces.length, 7);
    await capture.hold(1.2);
    await page.screenshot({ path: path.join(output, "03-imprint-preview.png") });
    await capture.action(() => page.keyboard.press("Escape"));
    assert.deepEqual((await capture.action(() => inspect(page))).document, original);
    await label(
      page,
      "Cancelled: document preserved",
      "Cues disappear outside modal picking. Split and Imprint use their existing preview and Undo path.",
    );
    await capture.hold(1);
    assert.deepEqual(errors, []);
    const state = await capture.action(() => inspect(page));
    await writeFile(path.join(output, "state.json"), JSON.stringify(state, null, 2));
    const metadata = await capture.export(path.join(output, "modal-plane-widgets.mp4"));
    await writeFile(
      path.join(output, "manifest.json"),
      JSON.stringify(
        { method: "fixed-step browser clock; not live performance", ...metadata },
        null,
        2,
      ),
    );
    console.log(JSON.stringify(metadata));
  } finally {
    await context.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
