import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { makePlate, worldClick } from "./ui-face-offset.mjs";
import { close, inspect } from "./ui-helpers.mjs";
import { chooseTool, toolEnabled } from "./ui-tools.mjs";

export async function modalMoveHistory(page) {
  const original = await makePlate(page);
  await orient(page, [0, -Math.sin(0.35), Math.cos(0.35)]);
  await worldClick(page, [0, 1.5, 2.5]);
  const hole = original.bodies[0].faces.find((face) => face.cylinder);
  await page.keyboard.press("m");
  const input = page.locator(".face-move-gizmo .face-transform-value");
  await page.getByRole("button", { name: "Move faces X", exact: true }).click();
  await input.fill("2");
  await inspect(page);
  await toolEnabled(page, "undo", "undo");
  await orient(page, [0.5, 0.5, 1]);
  await page.getByRole("button", { name: "Move faces Y", exact: true }).click();
  await input.fill("1");
  await inspect(page);
  await toolEnabled(page, "undo", "undo");
  await chooseTool(page, "undo", "undo");
  let state = await inspect(page);
  let cylinder = state.preview.bodies[0].faces.find((face) => face.id === hole.id).cylinder;
  close(cylinder.origin[0], 2);
  close(cylinder.origin[1], 0);
  assert.equal(state.interaction.kind, "face-move");
  assert.deepEqual(state.document, original);
  await chooseTool(page, "undo", "undo");
  state = await inspect(page);
  cylinder = state.preview.bodies[0].faces.find((face) => face.id === hole.id).cylinder;
  close(cylinder.origin[0], 0);
  await chooseTool(page, "redo", "redo");
  await inspect(page);
  await chooseTool(page, "redo", "redo");
  state = await inspect(page);
  cylinder = state.preview.bodies[0].faces.find((face) => face.id === hole.id).cylinder;
  close(cylinder.origin[0], 2);
  close(cylinder.origin[1], 1);
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original);
}

export async function modalPlacementHistory(page) {
  await page.getByRole("button", { name: "Select Sketch 1", exact: true }).click();
  const original = (await inspect(page)).document;
  await chooseTool(page, "transform", "transform");
  await page.getByRole("button", { name: "Move sketch X", exact: true }).click();
  await page.getByRole("textbox", { name: "Translation X", exact: true }).fill("3");
  let state = await inspect(page);
  close(state.preview.sketches[0].plane.origin[0], 3);
  await chooseTool(page, "undo", "undo");
  state = await inspect(page);
  close(state.preview.sketches[0].plane.origin[0], 0);
  await chooseTool(page, "redo", "redo");
  state = await inspect(page);
  close(state.preview.sketches[0].plane.origin[0], 3);
  await page.mouse.click(20, 20);
  assert.equal(
    (await inspect(page)).interaction.kind,
    "placement",
    "Selection stays owned by placement",
  );
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original);
}
