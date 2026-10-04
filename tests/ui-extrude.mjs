import assert from "node:assert/strict";
import { resolve } from "node:path";
import { openDocument, saveDocument } from "./native-documents.mjs";
import { orient } from "./ui-blend-edit.mjs";
import { at, close, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function extrudeRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-15, -10], [15, 10]);
  const pick = await at(page, 5, 3);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(pick.x, pick.y);
  if (!(await page.getByRole("textbox", { name: "Extrusion distance" }).isVisible()))
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("5");
  await page.keyboard.press("Enter");
  let state = await inspect(page);
  assert.equal(state.document.bodies?.length ?? 0, 0);
  assert.equal(state.preview.bodies.length, 1);
  close(state.preview.bodies[0].volume, 3000);
  await page.keyboard.press("Enter");
  state = await inspect(page);
  assert.equal(state.document.bodies.length, 1);
  // Undo rewinds the temporary extrusion without accepting or leaving the tool.
  await undoModalExtrusion(page, pick);
  await page.mouse.click(pick.x, pick.y);
  state = await inspect(page);
  assert.equal(state.modelingSelection[0].kind, "face");
  await chooseTool(page, "sketch on face", "sketch-on-face");
  await page.keyboard.press("c");
  await drag(page, [0, 0], [3, 0]);
  // Grid spacing can round the pointer placement to 4 mm at this viewport size.
  // Enter the intended radius through the ordinary precision control.
  await page.getByRole("textbox", { name: "Radius", exact: true }).fill("3");
  await page.keyboard.press("Enter");
  const center = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  if (!(await page.getByRole("textbox", { name: "Extrusion distance" }).isVisible()))
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("-10");
  await page.keyboard.press("Enter");
  state = await inspect(page);
  assert.ok(state.preview, state.message);
  close(state.preview.bodies[0].volume, 3000 - 45 * Math.PI);
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.screenshot({ path: `.cache/sketch-review/${name}-plate-hole.png` });
  const splitBodies = await splitPlate(page, pick);
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.bodies.length, 1);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document.bodies, splitBodies);
  await page.mouse.click(pick.x, pick.y);
  await chooseTool(page, "sketch on face", "sketch-on-face");
  await page.keyboard.press("l");
  await drag(page, [-10, 3], [-5, 3]);
  state = await inspect(page);
  assert.equal(state.document.sketches.length, 4);
  assert.deepEqual(state.document.bodies, splitBodies);
  await page.screenshot({ path: `.cache/sketch-review/${name}-split-face-sketch.png` });
  await reopen(page, name, splitBodies);
}

async function splitPlate(page, pick) {
  await page.mouse.click(pick.x, pick.y);
  await chooseTool(page, "sketch on face", "sketch-on-face");
  await page.keyboard.press("r");
  const grid = String((await inspect(page)).gridSnap) === "true";
  if (grid) await chooseTool(page, "grid snap", "grid");
  await drag(page, [7, -12], [9, 12]);
  if (grid) await chooseTool(page, "grid snap", "grid");
  const cut = await at(page, 8, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(cut.x, cut.y);
  if (!(await page.getByRole("textbox", { name: "Extrusion distance" }).isVisible()))
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("-10");
  await page.keyboard.press("Enter");
  let state = await inspect(page);
  assert.equal(state.preview.bodies.length, 2);
  assert.equal(state.document.bodies.length, 1);
  await page.keyboard.press("Enter");
  state = await inspect(page);
  assert.equal(state.document.bodies.length, 2);
  return state.document.bodies;
}

async function undoModalExtrusion(page, pick) {
  await page.mouse.click(pick.x, pick.y);
  await page.keyboard.press("e");
  if (!(await page.getByRole("textbox", { name: "Extrusion distance" }).isVisible()))
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  const original = (await inspect(page)).document;
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("3");
  await page.keyboard.press("Enter");
  assert.ok((await inspect(page)).preview);
  await page.keyboard.press("Meta+z");
  const state = await inspect(page);
  assert.equal(state.interaction.kind, "extrude");
  assert.equal(state.preview, null);
  assert.equal(state.document.bodies.length, 1);
  close(state.document.bodies[0].volume, 3000);
  assert.deepEqual(state.document, original);
  await page.keyboard.press("Meta+Shift+z");
  const redone = await inspect(page);
  assert.ok(redone.preview);
  close(redone.preview.bodies[0].volume, 4800);
  assert.deepEqual(redone.document, original);
  await page.keyboard.press("Escape");
  assert.equal((await inspect(page)).interaction, null);
  // Local navigation keeps the input selection; clear it before the next fresh pick.
  await page.keyboard.press("Escape");
  await inspect(page);
}

async function reopen(page, name, splitBodies) {
  const file = resolve(`.cache/sketch-review/${name}-solid.makeshift`);
  await saveDocument(page, file);
  await reset(page);
  await openDocument(page, file);
  await page.waitForFunction(() => window.makeshiftInspect().document.bodies?.length === 2);
  const state = await inspect(page);
  assert.equal(state.document.sketches.length, 4);
  assert.deepEqual(
    state.document.bodies.map((b) => b.id),
    splitBodies.map((b) => b.id),
  );
  assert.deepEqual(
    state.document.bodies.map((b) => b.faces.map((f) => f.id)),
    splitBodies.map((b) => b.faces.map((f) => f.id)),
  );
  await orient(page, [0.5, 0.5, 1]);
  await page.screenshot({ path: `.cache/sketch-review/${name}-reopened-solids.png` });
}

export async function extrusionGestureRoute(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XZ", "sketch-xz");
  await page.keyboard.press("c");
  await drag(page, [0, 0], [5, 0]);
  const pick = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(pick.x, pick.y);
  const handle = await page
    .getByRole("button", { name: "Drag extrusion", exact: true })
    .boundingBox();
  assert.ok(handle);
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 - 60, {
    steps: 6,
  });
  await page.mouse.up();
  let state = await inspect(page);
  assert.equal(state.document.bodies?.length ?? 0, 0);
  assert.equal(state.preview.bodies.length, 1);
  assert.ok(state.preview.bodies[0].volume > 0);
  const camera = state.camera;
  await orient(page, [0.5, 0.5, 1]);
  state = await inspect(page);
  assert.notDeepEqual(state.camera, camera);
  assert.equal(state.interaction.kind, "extrude");
  await page.keyboard.press("Escape");
  state = await inspect(page);
  assert.equal(state.preview, null);
  assert.equal(state.document.bodies?.length ?? 0, 0);
}
