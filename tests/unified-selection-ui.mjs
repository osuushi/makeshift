import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { launchElectron } from "./native-documents.mjs";
import { plate } from "./ui-body-fillet.mjs";
import { trackballRoute } from "./ui-camera-trackball.mjs";
import { at, click, drag, inspect, reset } from "./ui-helpers.mjs";
import { modelFrustumSelectionRoute } from "./ui-model-frustum-selection.mjs";
import { pointChoiceRoute } from "./ui-point-choice.mjs";
import { runtimeNames } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";
import { typedSelectionRoute } from "./ui-typed-selection.mjs";
import { wholeSketchSubtraction } from "./ui-whole-sketch-subtraction.mjs";

async function mouseSelection(page, name) {
  await typedSelectionRoute(page, name);
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("l");
  await drag(page, [-20, 0], [-5, 0]);
  await drag(page, [5, 0], [20, 0]);
  await page.keyboard.press("v");
  await click(page, -15, 0);
  await page.keyboard.down("Shift");
  await click(page, 15, 0);
  await click(page, 15, 0);
  await page.keyboard.up("Shift");
  assert.equal((await inspect(page)).selectedCurves.length, 2);
  const before = (await inspect(page)).document;
  await page.keyboard.down("Meta");
  await click(page, 15, 0);
  await page.keyboard.up("Meta");
  assert.equal((await inspect(page)).selectedCurves.length, 1);
  assert.ok((await inspect(page)).activePlane);
  await page.keyboard.down("Meta");
  await click(page, 15, 0);
  await page.keyboard.up("Meta");
  assert.equal((await inspect(page)).selectedCurves.length, 2);
  await click(page, -20, 0);
  await page.keyboard.down("Shift");
  await click(page, 20, 0);
  await click(page, 20, 0);
  await page.keyboard.up("Shift");
  assert.equal((await inspect(page)).selectionTargets.length, 2);
  await page.keyboard.down("Meta");
  await click(page, 20, 0);
  await page.keyboard.up("Meta");
  assert.equal((await inspect(page)).selectionTargets.length, 1);
  assert.deepEqual((await inspect(page)).document, before);
  await page.keyboard.press("Escape");
  await drag(page, [-25, 5], [25, -5]);
  assert.equal((await inspect(page)).selectedCurves.length, 2);
  await drag(page, [-25, 5], [25, -5], ["Shift"]);
  assert.equal((await inspect(page)).selectedCurves.length, 2);
  await drag(page, [-25, 5], [25, -5], ["Control"]);
  assert.equal((await inspect(page)).selectedCurves.length, 0);
  await pointChoiceRoute(page, name);
  await trackballRoute(page, name);
}
async function modelSelection(page, name) {
  const { center } = await plate(page);
  const facePoint = { x: center.x - 60, y: center.y - 60 };
  await page.mouse.click(facePoint.x, facePoint.y);
  assert.equal((await inspect(page)).modelingSelection.length, 1);
  await page.keyboard.down("Shift");
  await page.mouse.click(facePoint.x, facePoint.y);
  await page.keyboard.up("Shift");
  assert.equal((await inspect(page)).modelingSelection.length, 1);
  await page.keyboard.down("Meta");
  await page.mouse.click(facePoint.x, facePoint.y);
  await page.keyboard.up("Meta");
  assert.equal(
    (await inspect(page)).modelingSelection.length,
    0,
    JSON.stringify((await inspect(page)).modelingSelection),
  );
  await page.keyboard.down("Meta");
  await page.mouse.click(facePoint.x, facePoint.y);
  await page.keyboard.up("Meta");
  assert.equal((await inspect(page)).modelingSelection.length, 1);
  const body = page.getByRole("button", { name: "Select Body 1", exact: true });
  await body.click();
  await body.click({ modifiers: ["Shift"] });
  assert.equal((await inspect(page)).modelingSelection.length, 1);
  const sketch = page.getByRole("button", { name: "Select Sketch 1", exact: true });
  await sketch.click({ modifiers: ["Shift"] });
  const ordered = (await inspect(page)).modelingSelection;
  assert.equal(ordered.length, 2);
  await body.click({ modifiers: ["Shift"] });
  assert.deepEqual((await inspect(page)).modelingSelection, ordered);
  await sketch.click({ modifiers: ["Meta"] });
  assert.equal((await inspect(page)).modelingSelection.length, 1);
  await body.click({ modifiers: ["Meta"] });
  assert.equal((await inspect(page)).modelingSelection.length, 0);
  await body.click({ modifiers: ["Meta"] });
  assert.equal((await inspect(page)).modelingSelection.length, 1);
  await modelFrustumSelectionRoute(page, name);
  console.log(name, "unified canvas/panel Shift-add, Command-toggle and Command-orbit passed");
}
async function overlapSelection(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-10, -10], [10, 10]);
  await page.keyboard.press("r");
  await drag(page, [-5, -5], [15, 15]);
  await page.keyboard.press("v");
  await click(page, -2, 8);
  await page
    .getByRole("button", { name: "Rectangle", exact: true })
    .nth(1)
    .click({ modifiers: ["Shift"] });
  assert.equal((await inspect(page)).selectedCurves.length, 8);
  const ordered = (await inspect(page)).selectionTargets;
  const point = await at(page, -2, 8);
  assert.equal(
    await page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.tagName, point),
    "CANVAS",
  );
  await page.keyboard.down("Shift");
  await click(page, -2, 8);
  await page.keyboard.up("Shift");
  await page
    .getByRole("button", { name: "Rectangle", exact: true })
    .nth(1)
    .click({ modifiers: ["Shift"] });
  assert.deepEqual((await inspect(page)).selectionTargets, ordered);
  await page.keyboard.down("Shift");
  await click(page, -2, 8);
  await page.keyboard.up("Shift");
  await page
    .getByRole("button", { name: "Rectangle", exact: true })
    .nth(1)
    .click({ modifiers: ["Meta"] });
  assert.equal((await inspect(page)).selectedCurves.length, 4);
}
const names = runtimeNames();
const server = await createServer({ server: { port: 0 } });
await server.listen();
try {
  for (const name of names) {
    let browser, app;
    try {
      let page;
      if (name === "electron") {
        app = await launchElectron({
          args: ["."],
          env: {
            ...process.env,
            MAKESHIFT_TEST_HIDDEN: "1",
            MAKESHIFT_DEV_URL: server.resolvedUrls.local[0],
          },
        });
        page = await app.firstWindow();
      } else {
        browser = await { chromium, webkit }[name].launch({ headless: true });
        page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
        await page.goto(server.resolvedUrls.local[0]);
      }
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      if (!process.argv.includes("--overlap")) {
        await mouseSelection(page, name);
        await modelSelection(page, name);
      }
      await overlapSelection(page);
      await wholeSketchSubtraction(page);
      console.log(name, "overlap-panel add/toggle and stable selection order passed");
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await app?.close();
    }
  }
} finally {
  await server.close();
}
