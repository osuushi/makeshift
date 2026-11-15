import assert from "node:assert/strict";
import { click, drag, inspect, modalCompleted, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Real Tab dispatch must focus dimensions instead of clicking the earlier offset
// widget; model tests cannot observe DOM ordering or the field's key continuation.
export async function sketchDimensionTabRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("c");
  await drag(page, [0, 0], [8, 0]);
  const before = (await inspect(page)).document;
  await page.keyboard.press("Tab");
  await focused(page, "Radius");
  assert.deepEqual((await inspect(page)).document, before, "Tab only changes focus");
  assert.equal(await page.getByRole("textbox", { name: "Offset distance" }).isVisible(), false);
  await page.keyboard.insertText("12");
  await page.keyboard.press("Enter");
  await modalCompleted(page);
  const changed = (await inspect(page)).document;
  assert.equal(changed.sketches[0].curves.length, 1);
  assert.equal(changed.sketches[0].curves[0].radius, 12);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);

  await page.keyboard.press("Escape");
  await click(page, 8, 0);
  await page.keyboard.press("Shift+Tab");
  await focused(page, "Radius");
  await page.keyboard.press("Tab");
  await focused(page, "Radius");
  await page.keyboard.insertText("10");
  await page.keyboard.press("Enter");
  await modalCompleted(page);
  assert.equal((await inspect(page)).document.sketches[0].curves[0].radius, 10);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);

  await page.keyboard.press("r");
  await drag(page, [20, 0], [40, 10]);
  const rectangle = (await inspect(page)).document;
  await page.keyboard.press("Tab");
  await focused(page, "Width");
  await page.keyboard.press("Tab");
  await focused(page, "Height");
  await page.keyboard.press("Shift+Tab");
  await focused(page, "Width");
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, rectangle);
  await sketchGuideTabRoute(page);
  console.log(
    `${name}: sketch Tab edits Radius with Undo; reverse Tab, dimension cycling, bow/fillet entry and Undo pass`,
  );
}

async function focused(page, label) {
  await page.waitForFunction(
    (label) => document.activeElement?.getAttribute("aria-label") === label,
    label,
  );
}

async function sketchGuideTabRoute(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("l");
  await drag(page, [0, 0], [20, 0]);
  await page.keyboard.press("v");
  await click(page, 6, 0);
  const original = (await inspect(page)).document;
  await page.keyboard.press("Tab");
  await focused(page, "Length");
  await page.keyboard.press("Tab");
  await focused(page, "Angle");
  await page.keyboard.press("Tab");
  await focused(page, "Bow radius");
  await page.keyboard.press("Escape");
  await modalCompleted(page);
  assert.deepEqual((await inspect(page)).document, original, "Escape cancels keyboard bow");
  await page.keyboard.press("Shift+Tab");
  await focused(page, "Bow radius");
  await page.keyboard.insertText("15");
  await page.keyboard.press("Enter");
  await modalCompleted(page);
  const arc = (await inspect(page)).document.sketches[0].curves[0];
  assert.equal(arc.kind, "arc");
  const chord = Math.hypot(arc.b.x - arc.a.x, arc.b.y - arc.a.y);
  assert.ok(Math.abs((chord * (1 + arc.bulge ** 2)) / (4 * Math.abs(arc.bulge)) - 15) < 1e-6);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);

  await page.keyboard.press("l");
  await drag(page, [0, 0], [0, 10], ["Shift"]);
  await page.keyboard.press("v");
  await click(page, 6, 0);
  await page.keyboard.down("Shift");
  await click(page, 0, 6);
  await page.keyboard.up("Shift");
  const corner = (await inspect(page)).document;
  await page.keyboard.press("Tab");
  await focused(page, "Corner angle");
  await page.keyboard.press("Tab");
  await focused(page, "Angle");
  await page.keyboard.press("Tab");
  await focused(page, "Fillet radius");
  await page.keyboard.insertText("2");
  await page.keyboard.press("Enter");
  await modalCompleted(page);
  assert.equal((await inspect(page)).document.sketches[0].curves.length, 3);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, corner);
}
