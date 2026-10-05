import assert from "node:assert/strict";
import { project } from "./ui-blend-edit.mjs";
import { edgeFinishPrism } from "./ui-edge-finish-fixtures.mjs";
import { inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";
import { deliveredAxisDelta } from "./ui-widget-delivered-input.mjs";
import { watchWidgetFrames } from "./ui-widget-frame-watch.mjs";
import {
  acceptHistory,
  assertWidgetTargets,
  dragPixels,
  sweepWidgets,
} from "./ui-widget-reachability.mjs";
import { rotateDocked } from "./ui-widget-rotation.mjs";

const button = (page, name) => page.getByRole("button", { name, exact: true });
const gizmo =
  ".body-gizmo:not([hidden]) > button:not([hidden]), .body-gizmo:not([hidden]) > input:not([hidden])";
const scale =
  ".scale-widget:not([hidden]) .transform-box-handle:not([hidden]), .scale-widget:not([hidden]) .scale-card:not([hidden])";

export async function transformReachability(page, name) {
  const before = await edgeFinishPrism(page);
  await button(page, "Select Body 1").click();
  await chooseTool(page, "transform", "transform");
  await sweepWidgets(page, before.bodies[0].center, `${gizmo}, ${scale}`, "Move/Scale assembly");
  await page.screenshot({ path: `.cache/sketch-review/${name}-widgets-body-scale-docked.png` });
  const pivot = before.bodies[0].center;
  await rotateBodyAndCancel(page, before);
  const a = await project(page, pivot),
    b = await project(page, [pivot[0] + 2, pivot[1], pivot[2]]);
  const state = await dragPixels(page, button(page, "Move body X"), { x: b.x - a.x, y: b.y - a.y });
  const delivered = deliveredAxisDelta(state.widgetGesture, {
    x: (b.x - a.x) / 2,
    y: (b.y - a.y) / 2,
  });
  assert.ok(
    Math.abs(state.document.bodies[0].center[0] - pivot[0] - delivered) < 0.001,
    JSON.stringify({
      requested: 2,
      delivered,
      actual: state.document.bodies[0].center[0] - pivot[0],
      gesture: state.widgetGesture,
    }),
  );
  console.log(
    `${name}: bodyX delivered${delivered}, actual${state.document.bodies[0].center[0] - pivot[0]}, clients${JSON.stringify(state.widgetGesture.map(({ x, y, requested }) => ({ x, y, requested })))}`,
  );
  const moved = (await inspect(page)).document;
  assert.ok(Math.abs(moved.bodies[0].center[0] - pivot[0] - delivered) < 0.001);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, moved);
  await scaleBodyAndCancel(page, moved);
  console.log(
    `${name}: docked Move rotation/translation, Scale pointer/numeric, Cancel and history passed`,
  );
}

async function scaleBodyAndCancel(page, moved) {
  await button(page, "Select Body 1").click();
  await chooseTool(page, "transform", "transform");
  const handle = page.locator(".transform-box-handle:visible").last();
  let state = await dragPixels(page, handle, { x: 12, y: -12 });
  assert.ok(state.preview?.bodies?.length);
  assert.notEqual(state.preview.bodies[0].volume, moved.bodies[0].volume);
  await watchWidgetFrames(page, `${gizmo}, ${scale}`);
  await assertWidgetTargets(page, `${gizmo}, ${scale}`, "active Scale card");
  const frames = await page.evaluate(async () => {
    for (let i = 0; i < 12; i++) await new Promise(requestAnimationFrame);
    window.widgetFrameWatch.active = false;
    return window.widgetFrameWatch;
  });
  assert.ok(frames.samples >= 10);
  assert.deepEqual(frames.failures, [], "New Scale card and frozen knob idle frames stay hittable");
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, moved);
  await handle.click();
  await page.getByRole("checkbox", { name: "Uniform scale", exact: true }).check();
  await page.getByRole("textbox", { name: "Transform scale X", exact: true }).fill("1.1");
  state = await inspect(page);
  assert.ok(Math.abs(state.preview.bodies[0].volume - moved.bodies[0].volume * 1.1 ** 3) < 0.001);
  await acceptHistory(page, button(page, "Accept transform scale"), moved);
}

async function rotateBodyAndCancel(page, before) {
  const state = await rotateDocked(
    page,
    button(page, "Rotate body Z"),
    before.bodies[0].center,
    [0, 0, 1],
    30,
  );
  const rotated = state.document;
  // Move pointer rotation with Shift retains the ordinary half-degree snap.
  const angle = ((Math.round(state.rotationInput.deliveredAngle * 2) / 2) * Math.PI) / 180;
  const extent = 10 * (Math.abs(Math.cos(angle)) + Math.abs(Math.sin(angle)));
  assert.ok(
    Math.abs(rotated.bodies[0].bounds[3] - extent) < 0.001,
    JSON.stringify({
      bounds: rotated.bodies[0].bounds,
      expected: extent,
      gesture: state.widgetGesture,
      input: state.rotationInput,
    }),
  );
  assert.ok(Math.abs(rotated.bodies[0].bounds[0] + extent) < 0.001);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, rotated);
  await chooseTool(page, "undo", "undo");
  await button(page, "Select Body 1").click();
  await chooseTool(page, "transform", "transform");
  await button(page, "Rotate body Z").click();
  await page.getByRole("textbox", { name: "Body rotation Z", exact: true }).fill("30");
  const numeric = (await inspect(page)).preview.bodies[0].bounds;
  const exactThirty = 10 * (Math.cos(Math.PI / 6) + Math.sin(Math.PI / 6));
  assert.ok(Math.abs(numeric[3] - exactThirty) < 0.001);
  assert.ok(Math.abs(numeric[0] + exactThirty) < 0.001);
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, before);
}
