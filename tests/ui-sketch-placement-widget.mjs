import assert from "node:assert/strict";
import { resolve } from "node:path";
import { openDocument, saveDocument } from "./native-documents.mjs";
import { orient, project } from "./ui-blend-edit.mjs";
import { at, close, drag, inspect, reset } from "./ui-helpers.mjs";
import { placementRotationSnapping } from "./ui-rotation-snapping.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function center(locator) {
  const b = await locator.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
async function gesture(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await inspect(page);
}
async function value(page, action, axis, amount) {
  await page.getByRole("button", { name: `${action} sketch ${axis}`, exact: true }).click();
  await page
    .getByRole("textbox", {
      name: `${action === "Move" ? "Translation" : "Rotation"} ${axis}`,
      exact: true,
    })
    .fill(String(amount));
  await page.keyboard.press("Enter");
  await inspect(page);
}
export async function sketchPlacementWidgetRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [10, 10], [30, 20]);
  const inside = await at(page, 20, 15);
  const original = (await inspect(page)).document.sketches[0];
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(inside.x, inside.y);
  await chooseTool(page, "transform", "transform");
  const root = page.locator(".sketch-placement-gizmo");
  assert.equal(await root.getAttribute("data-mode"), "2d");
  assert.equal(await root.locator(".body-translate-handle:visible").count(), 2);
  assert.equal(await root.locator(".body-rotate-handle:visible").count(), 1);
  assert.equal(await page.locator(".placement-axis").count(), 0);
  await value(page, "Move", "X", 5);
  let moved = (await inspect(page)).document.sketches[0];
  close(moved.plane.origin[0], 5);
  assert.deepEqual(moved.curves, original.curves);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document.sketches[0], original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document.sketches[0], moved);
  const from = await center(page.getByRole("button", { name: "Move sketch Y", exact: true }));
  const a = await project(page, [0, 0, 0]),
    b = await project(page, [0, 10, 0]);
  await gesture(page, from, { x: from.x + b.x - a.x, y: from.y + b.y - a.y });
  moved = (await inspect(page)).document.sketches[0];
  close(moved.plane.origin[1], 10);
  const anchor = page.getByRole("button", { name: "Reposition sketch pivot", exact: true });
  await gesture(page, await center(anchor), await project(page, [0, 0, 0]));
  assert.deepEqual((await inspect(page)).document.sketches[0], moved);
  await anchorChecks(page, anchor);
  const origin = await center(anchor);
  const rotation = await center(page.getByRole("button", { name: "Rotate sketch Z", exact: true }));
  await placementRotationSnapping(page, rotation, origin);
  await quarterRotation(page, anchor);
  const rotated = (await inspect(page)).document.sketches[0];
  close(rotated.plane.origin[0], -10);
  close(rotated.plane.origin[1], 5);
  assert.deepEqual(rotated.curves, original.curves);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document.sketches[0], moved);
  await page.getByRole("button", { name: "Move sketch X", exact: true }).click();
  await page.getByRole("textbox", { name: "Translation X", exact: true }).fill("invalid");
  await page.keyboard.press("Enter");
  assert.equal(await root.locator("input").getAttribute("aria-invalid"), "true");
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document.sketches[0], moved);
  await orient(page, [1, 1, 1]);
  assert.equal(await root.getAttribute("data-mode"), "3d");
  assert.equal(await root.locator(".body-axis-handle:visible").count(), 6);
  await value(page, "Rotate", "X", 0.073);
  const oblique = (await inspect(page)).document.sketches[0];
  close(oblique.plane.v[2], Math.sin((0.073 * Math.PI) / 180));
  await page.screenshot({ path: `.cache/sketch-review/${name}-whole-sketch-widget.png` });
  await reopen(page, name, oblique);
  await chooseTool(page, "edit sketch", "edit-sketch");
  assert.equal((await inspect(page)).activeSketch, original.id);
  assert.equal(await root.isVisible(), false);
  console.log(
    `${name}: whole-sketch widget, numeric/pointer placement, custom anchor rotation, invalid cancellation, history and re-edit passed`,
  );
}

async function quarterRotation(page, anchor) {
  const handle = page.getByRole("button", { name: "Rotate sketch Z", exact: true });
  await handle.hover();
  const from = await center(handle),
    pivot = await center(anchor);
  const offset = await handle.evaluate((element) => {
    const values = getComputedStyle(element).translate.split(" ").map(Number.parseFloat);
    return { x: values[0] || 0, y: values[1] || 0 };
  });
  const origin = { x: pivot.x + offset.x, y: pivot.y + offset.y };
  await gesture(page, from, {
    x: origin.x + from.y - origin.y,
    y: origin.y - from.x + origin.x,
  });
}

async function anchorChecks(page, anchor) {
  const before = (await inspect(page)).document;
  const origin = await project(page, [0, 0, 0]);
  await page.keyboard.down("Meta");
  await gesture(page, await center(anchor), { x: origin.x + 6, y: origin.y + 6 });
  await page.keyboard.up("Meta");
  const free = await center(anchor);
  assert.ok(Math.hypot(free.x - origin.x, free.y - origin.y) > 5);
  await page.mouse.move(free.x, free.y);
  await page.mouse.down();
  await page.mouse.move(free.x + 40, free.y + 20, { steps: 4 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  const cancelled = await center(anchor);
  assert.ok(Math.hypot(cancelled.x - free.x, cancelled.y - free.y) < 1);
  await gesture(page, cancelled, origin);
  const snapped = await center(anchor);
  assert.ok(Math.hypot(snapped.x - origin.x, snapped.y - origin.y) < 1);
  assert.deepEqual((await inspect(page)).document, before);
}
async function reopen(page, name, sketch) {
  const file = resolve(`.cache/sketch-review/${name}-whole-sketch.makeshift`);
  await saveDocument(page, file);
  await reset(page);
  await openDocument(page, file);
  assert.deepEqual((await inspect(page)).document.sketches[0], sketch);
  await page.getByRole("button", { name: "Select Sketch 1", exact: true }).click();
  await chooseTool(page, "transform", "transform");
  await page
    .getByRole("button", { name: "Reposition sketch pivot", exact: true })
    .waitFor({ state: "visible" });
}
