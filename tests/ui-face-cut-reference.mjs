import assert from "node:assert/strict";
import { resolve } from "node:path";
import { openDocument, saveDocument } from "./native-documents.mjs";
import { orient } from "./ui-blend-edit.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { planeHover } from "./ui-plane-hover.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function finishExtrusion(page, point, distance) {
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(point.x, point.y);
  await page
    .getByRole("textbox", { name: "Extrusion distance", exact: true })
    .fill(String(distance));
  await inspect(page);
  await page.getByRole("button", { name: "Accept extrusion", exact: true }).click();
  await inspect(page);
}
async function fixture(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("c");
  await drag(page, [0, 0], [5, 0]);
  await page.getByRole("textbox", { name: "Radius", exact: true }).fill("5");
  await page.keyboard.press("Enter");
  await inspect(page);
  await finishExtrusion(page, await at(page, 0, 0), 5);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await chooseTool(page, "transform", "transform");
  await orient(page, [1, -1, 1]);
  await page.getByRole("button", { name: "Move body Z", exact: true }).click();
  await page.locator(".body-transform-value").fill("30");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-10, -10], [10, 10]);
  await finishExtrusion(page, await at(page, 8, 8), 20);
  await orient(page, [1, -1, 0.7]);
  return (await inspect(page)).document;
}
async function pickReference(page) {
  await worldClick(page, [3, -3, 20]);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "face");
  await chooseTool(page, "imprint", "imprint");
  await page.getByRole("status").filter({ hasText: "Pick an outlined" }).waitFor();
  await planeHover(page, [0, -5, 32], "curved-face");
  await worldClick(page, [0, -5, 32]);
}
export async function faceCutReferenceRoute(page, name) {
  const before = await fixture(page);
  await pickReference(page);
  let state = await inspect(page);
  assert.ok(state.preview);
  assert.equal(state.bodyRendering.planeCutEdges.length, 1);
  assert.equal(state.bodyRendering.planeCutTargets.length, 1);
  await page
    .locator(".plane-cut-inputs")
    .filter({ hasText: "Cutter · Body 1 · curved face" })
    .waitFor();
  assert.equal(state.preview.bodies[1].faces.length, 7);
  assert.deepEqual(state.document, before);
  const hasCircle = async () =>
    (await inspect(page)).preview.bodies[1].edges.some((edge) => edge.curve?.kind === "circle");
  assert.equal(await hasCircle(), true);
  await worldClick(page, [0, -16, 16]);
  assert.equal(await hasCircle(), false, "A plane replaces the curved reference");
  await chooseTool(page, "undo", "undo");
  assert.equal(await hasCircle(), true, "Temporary Undo restores the curved reference");
  await chooseTool(page, "redo", "redo");
  assert.equal(await hasCircle(), false);
  await worldClick(page, [0, -5, 32]);
  assert.equal(await hasCircle(), true, "A curved reference replaces the plane");
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, before);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "face");
  await pickReference(page);
  await page.keyboard.press("Enter");
  const imprinted = (await inspect(page)).document;
  assert.equal(imprinted.bodies[1].faces.length, 7);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, imprinted);
  await worldClick(page, [0, -5, 20]);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "edge");
  await chooseTool(page, "reopen last operation", "reopen-operation");
  assert.equal((await inspect(page)).preview.bodies[1].faces.length, 7);
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, imprinted);
  await chooseTool(page, "undo", "undo");
  await page.getByRole("button", { name: "Select Body 2", exact: true }).click();
  await chooseTool(page, "split body", "split");
  await worldClick(page, [0, -5, 32]);
  state = await inspect(page);
  assert.equal(state.preview.bodies.length, 3);
  assert.deepEqual(state.document, before);
  await page.keyboard.press("Enter");
  const split = (await inspect(page)).document;
  assert.equal(split.bodies.length, 3);
  assert.ok(split.bodies.some((body) => Math.abs(body.volume - Math.PI * 25 * 20) < 1e-6));
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, split);
  const path = resolve(`.cache/plane-probe/${name}-face-cut.makeshift`);
  await saveDocument(page, path);
  await openDocument(page, path);
  assert.deepEqual(
    (await inspect(page)).document.bodies.map((body) => body.edges.map((edge) => edge.id)),
    split.bodies.map((body) => body.edges.map((edge) => edge.id)),
  );
  await editSplitPiece(page);
  console.log(
    `${name}: curved face reference picking, hover, Split, Imprint, cancel, history, Reopen and result editing passed`,
  );
}

/** Curved Split results remain ordinary independently editable bodies. */
async function editSplitPiece(page) {
  const before = (await inspect(page)).document;
  const index = before.bodies.findIndex((body) => Math.abs(body.volume - Math.PI * 25 * 20) < 1e-6);
  assert.ok(index >= 0);
  const core = before.bodies[index];
  const select = () =>
    page.getByRole("button", { name: `Select Body ${index + 1}`, exact: true }).click();
  await select();
  await chooseTool(page, "transform", "transform");
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  await page.locator(".body-transform-value").fill("2");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  const moved = (await inspect(page)).document.bodies.find((body) => body.id === core.id);
  assert.ok(moved);
  assert.ok(Math.abs(moved.center[0] - 2) < 1e-6);
  assert.ok(Math.abs(moved.volume - Math.PI * 25 * 20) < 1e-6);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await select();
  await page.locator("#world canvas").focus();
  await page.keyboard.press("Backspace");
  const deleted = (await inspect(page)).document;
  assert.equal(deleted.bodies.length, 2);
  assert.ok(deleted.bodies.every((body) => body.id !== core.id));
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await reset(page);
}
