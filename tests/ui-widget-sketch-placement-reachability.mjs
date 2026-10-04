import assert from "node:assert/strict";
import { project } from "./ui-blend-edit.mjs";
import { drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";
import { deliveredAxisDelta } from "./ui-widget-delivered-input.mjs";
import { dragPixels, sweepWidgets } from "./ui-widget-reachability.mjs";
import { assertRotatedFrame, assertTranslatedFrame, rotateDocked } from "./ui-widget-rotation.mjs";

const button = (page, name) => page.getByRole("button", { name, exact: true });
const gizmo =
  ".body-gizmo:not([hidden]) > button:not([hidden]), .body-gizmo:not([hidden]) > input:not([hidden])";
const scale =
  ".scale-widget:not([hidden]) .transform-box-handle:not([hidden]), .scale-widget:not([hidden]) .scale-card:not([hidden])";
export async function sketchPlacementReachability(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  if ((await inspect(page)).gridSnap) await chooseTool(page, "grid snap", "grid");
  await page.keyboard.press("r");
  await drag(page, [-6, -4], [6, 4]);
  await chooseTool(page, "return to modeling", "modeling");
  await button(page, "Select Sketch 1").click();
  await chooseTool(page, "transform", "transform");
  const before = (await inspect(page)).document;
  await sweepWidgets(page, [0, 0, 0], `${gizmo}, ${scale}`, "whole sketch placement");
  const rotation = await rotateDocked(
    page,
    button(page, "Rotate sketch Z"),
    [0, 0, 0],
    [0, 0, 1],
    30,
  );
  const rotated = (await inspect(page)).document;
  assertRotatedFrame(
    rotated.sketches[0].plane,
    before.sketches[0].plane,
    Math.round(rotation.rotationInput.deliveredAngle * 2) / 2,
    1e-5,
  );
  assert.deepEqual(rotated.sketches[0].curves, before.sketches[0].curves);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, rotated);
  await chooseTool(page, "undo", "undo");
  await numericPlacement(page, before, "Rotate sketch Z", "Rotation Z", "30", (sketch) => {
    assertRotatedFrame(sketch.plane, before.sketches[0].plane, 30, 1e-5);
    assert.deepEqual(sketch.curves, before.sketches[0].curves);
  });
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, rotated);
  await button(page, "Move sketch X").click();
  await page.getByRole("textbox", { name: "Translation X", exact: true }).fill("3");
  assert.deepEqual((await inspect(page)).document, rotated);
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, rotated);
  const a = await project(page, [0, 0, 0]),
    b = await project(page, [0, 0, 2]);
  const gesture = await dragPixels(
    page,
    button(page, "Move sketch Z"),
    { x: b.x - a.x, y: b.y - a.y },
    ["Shift"],
  );
  const delivered = deliveredAxisDelta(gesture.widgetGesture, {
    x: (b.x - a.x) / 2,
    y: (b.y - a.y) / 2,
  });
  const moved = (await inspect(page)).document;
  assertTranslatedFrame(moved.sketches[0].plane, rotated.sketches[0].plane, 2, delivered, 1e-5);
  assert.equal(moved.sketches[0].id, before.sketches[0].id);
  assert.deepEqual(moved.sketches[0].curves, rotated.sketches[0].curves);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, rotated);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, moved);
  await chooseTool(page, "undo", "undo");
  await numericPlacement(page, rotated, "Move sketch Z", "Translation Z", "2", (sketch) => {
    assertTranslatedFrame(sketch.plane, rotated.sketches[0].plane, 2, 2, 1e-5);
    assert.deepEqual(sketch.curves, rotated.sketches[0].curves);
  });
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, moved);
  await button(page, "Select Sketch 1").click();
  await chooseTool(page, "edit sketch", "edit-sketch");
  assert.equal((await inspect(page)).activeSketch, before.sketches[0].id);
  console.log(
    `${name}: docked whole-sketch rotation/translation, unchanged curves, Cancel/history and re-edit passed`,
  );
}

/** A canceled numeric preview preserves the accepted document and its redo branch. */
async function numericPlacement(page, before, handle, label, value, check) {
  await button(page, handle).click();
  await page.getByRole("textbox", { name: label, exact: true }).fill(value);
  const preview = (await inspect(page)).preview.sketches[0];
  check(preview);
  assert.equal(preview.id, before.sketches[0].id);
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, before);
}
