import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { at, click, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";
import { deliveredPlaneDelta } from "./ui-widget-delivered-input.mjs";
import { numericPlanarMove, numericPlanarRotation } from "./ui-widget-planar-numeric.mjs";
import {
  assertPlanarRotation,
  planarReference,
  rotatedPlanarPoint,
} from "./ui-widget-planar-reference.mjs";
import {
  assertWidgetTargets,
  centerOf,
  dragPixels,
  sweepWidgets,
} from "./ui-widget-reachability.mjs";
import { rotateDocked } from "./ui-widget-rotation.mjs";
import { panTo } from "./ui-widget-wheel.mjs";

const glyphs = "[data-move-marker] > svg";
const frames = {
  XY: { u: [1, 0, 0], normal: [0, 0, 1] },
  XZ: { u: [1, 0, 0], normal: [0, -1, 0] },
  YZ: { u: [0, 1, 0], normal: [1, 0, 0] },
};
async function history(page, before, after) {
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, after);
}
async function planarRect(page, plane) {
  await reset(page);
  await chooseTool(page, `Sketch on ${plane}`, `sketch-${plane.toLowerCase()}`);
  if ((await inspect(page)).gridSnap) await chooseTool(page, "grid snap", "grid");
  await page.keyboard.press("r");
  await drag(page, [-6, -4], [6, 4]);
  return (await inspect(page)).document;
}
async function assertGlyphHit(page, axis) {
  const point = await centerOf(page.locator(`[data-move-marker="${axis}"] > svg`));
  assert.equal(
    await page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.tagName, point),
    "CANVAS",
  );
  await page.mouse.move(point.x, point.y);
  const hit = (await inspect(page)).hover;
  assert.equal(hit.kind, axis === "rotation" ? "rotate" : "translate");
  if (axis !== "rotation") assert.equal(hit.axis, axis);
}
export async function planarReachability(page, name) {
  // 800px / 80 world units gives integer20px for the exact two-unit pointer fixture.
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const [plane, frame] of Object.entries(frames))
    await planarPlaneReachability(page, name, plane, frame);
  console.log(
    `${name}: XY/XZ/YZ docked Move, standalone rotation, frozen plane rays, IDs, Cancel and one Undo/Redo passed`,
  );
}
async function planarPlaneReachability(page, name, plane, frame) {
  const before = await planarRect(page, plane);
  await chooseTool(page, "transform", "transform");
  await sweepWidgets(page, [0, 0, 0], glyphs, `${plane} floating Move`, { orbit: false });
  await orient(page, frame.normal);
  const canvas = await page.locator("#world canvas").boundingBox();
  await panTo(page, [0, 0, 0], { x: -40, y: canvas.height / 2 });
  await assertWidgetTargets(page, glyphs, `${plane} docked map`);
  await page.screenshot({ path: `.cache/sketch-review/${name}-widgets-planar-${plane}.png` });
  await assertGlyphHit(page, "x");
  const a = await at(page, 0, 0),
    b = await at(page, 2, 0),
    u = await at(page, 1, 0),
    v = await at(page, 0, 1);
  const gesture = await dragPixels(
    page,
    page.locator('[data-move-marker="x"] > svg'),
    { x: b.x - a.x, y: b.y - a.y },
    ["Shift"],
  );
  assert.equal(gesture.widgetGesture.at(-1).interaction?.kind, "pointer");
  const delivered = deliveredPlaneDelta(gesture.widgetGesture, a, u, v).x;
  const moved = (await inspect(page)).document;
  const first = before.sketches[0].curves[0],
    actual = moved.sketches[0].curves[0];
  assert.ok(
    Math.abs(actual.a.x - first.a.x - delivered) < 1e-5,
    JSON.stringify({
      plane,
      first,
      actual,
      gesture: gesture.widgetGesture,
      camera: gesture.camera,
    }),
  );
  assert.ok(Math.abs(actual.a.y - first.a.y) < 1e-5);
  assert.deepEqual(
    moved.sketches[0].curves.map((curve) => curve.id),
    before.sketches[0].curves.map((curve) => curve.id),
  );
  await history(page, before, moved);
  await chooseTool(page, "undo", "undo");
  await numericPlanarMove(page, before, `Move ${plane[0]}`, (after) => {
    before.sketches[0].curves.forEach((curve, i) => {
      assert.equal(after.sketches[0].curves[i].id, curve.id);
      for (const key of ["a", "b"]) {
        assert.ok(Math.abs(after.sketches[0].curves[i][key].x - curve[key].x - 2) < 1e-5);
        assert.ok(Math.abs(after.sketches[0].curves[i][key].y - curve[key].y) < 1e-5);
      }
    });
  });
  await planarRotations(page, before, frame, plane);
}

async function planarRotations(page, before, frame, plane) {
  const sketch = before.sketches[0],
    first = sketch.curves[0],
    reference = planarReference(sketch);
  await chooseTool(page, "transform", "transform");
  await assertGlyphHit(page, "rotation");
  const field = page.getByRole("textbox", { name: "Angle", exact: true });
  const initialField = (await field.count()) ? await field.inputValue() : null;
  const rotation = await rotateDocked(
    page,
    page.locator('[data-move-marker="rotation"]'),
    reference.world,
    frame.normal,
    30,
  );
  const rotated = (await inspect(page)).document;
  const target = rotated.sketches[0].curves[0].a;
  const angle = Math.round(rotation.rotationInput.deliveredAngle * 2) / 2;
  const expected = rotatedPlanarPoint(first.a, reference.center, angle);
  const diagnostic = {
    plane,
    initialField,
    first,
    target,
    expected,
    angle,
    reference,
    input: rotation.rotationInput,
    press: rotation.widgetPress,
    gesture: rotation.widgetGesture,
  };
  if (process.env.MAKESHIFT_WIDGET_TRACE)
    console.log(`${plane}: planar pointer rotation ${JSON.stringify(diagnostic)}`);
  assertPlanarRotation(rotated.sketches[0], sketch, reference.center, angle);
  await history(page, before, rotated);
  await chooseTool(page, "undo", "undo");
  await numericPlanarRotation(page, before, true);
  await chooseTool(page, "transform", "transform");
  const marker = page.locator('[data-move-marker="y"] > svg'),
    start = await centerOf(marker);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x, start.y - 25, { steps: 4 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.deepEqual((await inspect(page)).document, before);
  // Leave Move and exercise the independently styled standalone rotation.
  await chooseTool(page, "select", "select");
  await assertGlyphHit(page, "rotation");
  const standalone = await rotateDocked(
    page,
    page.locator('[data-move-marker="rotation"]'),
    reference.world,
    frame.normal,
    30,
  );
  const standaloneAngle = Math.round(standalone.rotationInput.deliveredAngle * 2) / 2;
  assertPlanarRotation(
    (await inspect(page)).document.sketches[0],
    sketch,
    reference.center,
    standaloneAngle,
  );
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await numericPlanarRotation(page, before, false);
}

export async function mixedPlanarReachability(page, name) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  if ((await inspect(page)).gridSnap) await chooseTool(page, "grid snap", "grid");
  await page.keyboard.press("l");
  await drag(page, [-20, 0], [-10, 0]);
  await page.keyboard.press("c");
  await drag(page, [10, 10], [14, 10]);
  await page.keyboard.press("v");
  await click(page, -20, 0);
  await page.keyboard.down("Shift");
  await click(page, 12, 11);
  await page.keyboard.up("Shift");
  const selected = await inspect(page),
    before = selected.document;
  assert.equal(selected.selectionTargets.filter((target) => target.kind === "endpoint").length, 1);
  assert.equal(selected.selectedCurves.length, 1);
  await chooseTool(page, "transform", "transform");
  await orient(page, [0, 0, 1]);
  const canvas = await page.locator("#world canvas").boundingBox();
  await panTo(page, [-3, 7, 0], { x: -40, y: canvas.height / 2 });
  await assertWidgetTargets(
    page,
    `${glyphs}, .scale-widget:not([hidden]) .transform-box-handle:not([hidden])`,
    "mixed point/curve and Scale",
  );
  await assertGlyphHit(page, "x");
  const a = await at(page, 0, 0),
    b = await at(page, 2, 0),
    u = await at(page, 1, 0),
    v = await at(page, 0, 1);
  const gesture = await dragPixels(
    page,
    page.locator('[data-move-marker="x"] > svg'),
    { x: b.x - a.x, y: b.y - a.y },
    ["Shift"],
  );
  const delivered = deliveredPlaneDelta(gesture.widgetGesture, a, u, v).x;
  const moved = (await inspect(page)).document;
  const [line, circle] = before.sketches[0].curves,
    [newLine, newCircle] = moved.sketches[0].curves;
  assert.ok(Math.abs(newLine.a.x - line.a.x - delivered) < 1e-5);
  assert.deepEqual(newLine.b, line.b);
  assert.ok(Math.abs(newCircle.center.x - circle.center.x - delivered) < 1e-5);
  assert.equal(newLine.id, line.id);
  assert.equal(newCircle.id, circle.id);
  await history(page, before, moved);
  await chooseTool(page, "undo", "undo");
  await numericPlanarMove(page, before, "Move X", (after) => {
    const [actualLine, actualCircle] = after.sketches[0].curves;
    assert.ok(Math.abs(actualLine.a.x - line.a.x - 2) < 1e-5);
    assert.deepEqual(actualLine.b, line.b);
    assert.ok(Math.abs(actualCircle.center.x - circle.center.x - 2) < 1e-5);
    assert.equal(actualLine.id, line.id);
    assert.equal(actualCircle.id, circle.id);
  });
  await panTo(page, [0, 0, 0], { x: canvas.width / 2, y: canvas.height / 2 });
  await page.keyboard.press("v");
  await click(page, 25, -20);
  await click(page, 12, 11);
  await chooseTool(page, "transform", "transform");
  await panTo(page, [10, 10, 0], { x: -40, y: canvas.height / 2 });
  await page.locator(".transform-box-handle:visible").last().click();
  await page.getByRole("checkbox", { name: "Uniform scale", exact: true }).check();
  await page.getByRole("textbox", { name: "Transform scale X", exact: true }).fill("1.2");
  const preview = (await inspect(page)).preview;
  assert.ok(Math.abs(preview.sketches[0].curves[1].radius - circle.radius * 1.2) < 1e-5);
  await assertWidgetTargets(
    page,
    ".scale-widget:not([hidden]) .scale-card:not([hidden])",
    "docked planar Scale card",
  );
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, before);
  console.log(
    `${name}: docked mixed point/full curve transform, IDs/history and planar Scale cancellation passed`,
  );
}
