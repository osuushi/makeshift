import assert from "node:assert/strict";
import { inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";
import { assertPlanarRotation, planarReference } from "./ui-widget-planar-reference.mjs";
import { centerOf } from "./ui-widget-reachability.mjs";
import { freeCanvasPoint } from "./ui-widget-wheel.mjs";

async function numericHistory(page, before, after) {
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, after);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
}

/** Exact local two-unit entry retains the original requested target separately from mouse delivery. */
export async function numericPlanarMove(page, before, label, check) {
  await chooseTool(page, "transform", "transform");
  await page.keyboard.press("Tab");
  await page.waitForFunction(
    (label) => document.activeElement?.getAttribute("aria-label") === label,
    label,
  );
  await page.getByRole("textbox", { name: label, exact: true }).fill("2");
  await page.keyboard.press("Enter");
  const after = (await inspect(page)).document;
  check(after);
  await numericHistory(page, before, after);
}

/** Exact angle entry through Move and standalone glyphs verifies ordinary local numeric acceptance. */
export async function numericPlanarRotation(page, before, move) {
  // A fresh ordinary selection gives this exact-angle check an explicit zero reference.
  // The retained-selection stale field after geometry Undo is diagnosed separately.
  await chooseTool(page, "select", "select");
  const empty = await freeCanvasPoint(page);
  await page.mouse.click(empty.x, empty.y);
  assert.deepEqual((await inspect(page)).selectedCurves, []);
  await page.keyboard.press("ControlOrMeta+a");
  const selected = await inspect(page);
  assert.deepEqual(
    [...selected.selectedCurves].sort(),
    before.sketches[0].curves.map((curve) => curve.id).sort(),
  );
  assert.deepEqual(selected.document, before);
  await chooseTool(page, move ? "transform" : "select", move ? "transform" : "select");
  const target = await centerOf(page.locator('[data-move-marker="rotation"] > svg'));
  await page.mouse.click(target.x, target.y);
  const initial = await inspect(page);
  const initialField = await page.getByRole("textbox", { name: "Angle", exact: true }).inputValue();
  assert.equal(initialField, "0", "Fresh ordinary selection establishes an explicit zero angle");
  assert.deepEqual(initial.document, before);
  await page.getByRole("textbox", { name: "Angle", exact: true }).fill("30");
  await page.keyboard.press("Enter");
  const after = (await inspect(page)).document;
  if (process.env.MAKESHIFT_WIDGET_TRACE)
    console.log(
      `planar numeric rotation ${JSON.stringify({ move, target, initialField, before: before.sketches[0], initial: initial.document.sketches[0], after: after.sketches[0], hover: initial.hover, rotationHandle: initial.rotationHandle })}`,
    );
  const sketch = before.sketches[0];
  assertPlanarRotation(after.sketches[0], sketch, planarReference(sketch).center, 30);
  await numericHistory(page, before, after);
}
