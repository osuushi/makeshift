import assert from "node:assert/strict";
import { resolve } from "node:path";
import { openDocument, saveDocument } from "./native-documents.mjs";
import { orient, project } from "./ui-blend-edit.mjs";
import { at, click, drag, inspect, reset } from "./ui-helpers.mjs";
import { mirrorNumericDraft } from "./ui-mirror-numeric.mjs";
import { findRaycastPoint } from "./ui-plane-targets.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function mirrorSketchRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [5, 3], [15, 9]);
  const original = (await inspect(page)).document;
  await chooseTool(page, "mirror", "mirror");
  assert.equal(
    await page.locator(".mirror-widget button").count(),
    2,
    "Only accept and cancel remain",
  );
  await click(page, 0, -20);
  let state = await inspect(page);
  assert.equal(state.preview.sketches[0].curves.length, 8);
  assert.deepEqual(state.document, original);
  await mirrorNumericDraft(page, original);
  await page.getByRole("textbox", { name: "Mirror offset" }).fill("2");
  state = await inspect(page);
  for (const [i, curve] of state.preview.sketches[0].curves.slice(4).entries()) {
    assert.ok(Math.abs(curve.a.x + 4 + original.sketches[0].curves[i].a.x) < 1e-7);
    assert.ok(Math.abs(curve.a.y - original.sketches[0].curves[i].a.y) < 1e-7);
  }
  await page.getByRole("button", { name: "Cancel mirror", exact: true }).click();
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "mirror", "mirror");
  await click(page, 0, -20);
  await inspect(page);
  await page.keyboard.press("Enter");
  const copied = (await inspect(page)).document;
  assert.equal(copied.sketches[0].curves.length, 8);
  assert.equal(copied.sketches[0].groups.length, 2);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, copied);
  await page.keyboard.press("v");
  await click(page, -8, 3);
  await page.keyboard.press("m");
  await drag(page, [-10, 6], [-10, 12]);
  state = await inspect(page);
  assert.notDeepEqual(state.document, copied, "copied rectangle can move");
  await chooseTool(page, "undo", "undo");
  await inspect(page);
  // Create and pick an actual unselected axis line, then replace a selected circle.
  await chooseTool(page, "grid snap", "grid");
  await page.keyboard.press("l");
  await drag(page, [-2, -15], [-2, 0], ["Shift"]);
  await page.keyboard.press("c");
  await drag(page, [8, -8], [11, -8], ["Shift"]);
  const before = (await inspect(page)).document;
  assert.equal(before.sketches[0].curves.length, 10, "axis line and circle were drawn");
  await chooseTool(page, "mirror", "mirror");
  await click(page, -2, -7);
  await inspect(page);
  await page.getByLabel("Keep original", { exact: true }).uncheck();
  state = await inspect(page);
  const circle = state.preview.sketches[0].curves.find((c) => c.kind === "circle");
  const sourceCircle = before.sketches[0].curves.at(-1);
  const axisLine = before.sketches[0].curves.at(-2);
  assert.ok(Math.abs(circle.center.x - (2 * axisLine.a.x - sourceCircle.center.x)) < 1e-7);
  await page.getByRole("button", { name: "Accept mirror", exact: true }).click();
  const replaced = (await inspect(page)).document;
  assert.equal(replaced.sketches[0].curves.length, before.sketches[0].curves.length);
  assert.equal(replaced.sketches[0].curves.at(-1).id, before.sketches[0].curves.at(-1).id);
  await page.screenshot({ path: `.cache/sketch-review/${name}-mirror-sketch.png` });
  await archive(page, name, replaced);
  console.log(
    `${name}: sketch Mirror axis/line, copy/replace, offset, cancel, Undo/Redo, movement and Save/Open passed`,
  );
}

export async function mirrorBodyRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [5, 3], [15, 9]);
  const center = await at(page, 10, 6);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("6");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  const original = (await inspect(page)).document;
  await chooseTool(page, "mirror", "mirror");
  await page.mouse.move(center.x, center.y);
  await page.waitForFunction(() => document.querySelector("canvas").style.cursor === "crosshair");
  assert.deepEqual((await inspect(page)).document, original);
  assert.equal((await inspect(page)).preview, null, "Face hover does not create a preview");
  await page.screenshot({ path: `.cache/sketch-review/${name}-mirror-face-hover.png` });
  await orient(page, [1, 1, 1]);
  await pickPlane(page, "YZ");
  let state = await inspect(page);
  assert.equal(state.preview.bodies.length, 2);
  assert.deepEqual(state.document, original);
  assert.ok(Math.abs(state.preview.bodies[1].center[0] + original.bodies[0].center[0]) < 1e-7);
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "mirror", "mirror");
  await pickPlane(page, "YZ");
  await inspect(page);
  await page.getByRole("button", { name: "Accept mirror", exact: true }).click();
  const mirrored = (await inspect(page)).document;
  assert.equal(mirrored.bodies.length, 2);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, mirrored);
  await page.getByRole("button", { name: "Select Body 2", exact: true }).click();
  await orient(page, [1, 1, 1]);
  await page.getByRole("button", { name: "Move body Z", exact: true }).click();
  await page.getByRole("textbox", { name: "Body translation Z", exact: true }).fill("2");
  await page.keyboard.press("Enter");
  state = await inspect(page);
  assert.ok(Math.abs(state.document.bodies[1].center[2] - 5) < 1e-7);
  // Pick the original body's planar top as the mirror reference for body 2.
  await orient(page, [0, 0, 1]);
  const top = await project(page, [10, 6, 6]);
  await chooseTool(page, "mirror", "mirror");
  await page.mouse.click(top.x, top.y);
  state = await inspect(page);
  assert.ok(state.preview, "planar face supplies a reference");
  await page.getByLabel("Keep original", { exact: true }).uncheck();
  await inspect(page);
  await page.getByRole("textbox", { name: "Mirror offset" }).fill("1");
  state = await inspect(page);
  assert.equal(state.preview.bodies.length, 2);
  assert.ok(Math.abs(state.preview.bodies[1].center[2] - 9) < 1e-7);
  await page.keyboard.press("Enter");
  const reflected = (await inspect(page)).document;
  await page.screenshot({ path: `.cache/sketch-review/${name}-mirror-bodies.png` });
  await archive(page, name, reflected);
  console.log(
    `${name}: body Mirror world/face plane, offset, copy/replace, preview/cancel, Undo/Redo, movement and Save/Open passed`,
  );
}

async function archive(page, name, before) {
  const path = resolve(`.cache/sketch-review/${name}-mirror.makeshift`);
  await saveDocument(page, path);
  await reset(page);
  await openDocument(page, path);
  const after = (await inspect(page)).document;
  assert.deepEqual(after.sketches, before.sketches);
  assert.deepEqual(
    (after.bodies ?? []).map((b) => b.id),
    (before.bodies ?? []).map((b) => b.id),
  );
  for (const [i, body] of (after.bodies ?? []).entries())
    assert.ok(Math.abs(body.volume - before.bodies[i].volume) < 1e-7);
}

async function pickPlane(page, id) {
  const point = await findRaycastPoint(page, id);
  assert.equal(await page.locator("canvas").evaluate((canvas) => canvas.style.cursor), "");
  await page.mouse.click(point.x, point.y);
}
