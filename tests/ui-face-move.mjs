import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { makeFeature, pickFeatureFace } from "./ui-face-move-fixtures.mjs";
import { faceMoveRaceRoute } from "./ui-face-move-races.mjs";
import { makePlate, worldClick } from "./ui-face-offset.mjs";
import { close, inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function quantity(page, label, value) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.locator(".face-move-gizmo .face-transform-value").fill(String(value));
  await inspect(page);
}
export async function faceMoveRoute(page, name, electron) {
  const original = await makePlate(page);
  await orient(page, [0, -Math.sin(0.35), Math.cos(0.35)]);
  await worldClick(page, [0, 1.5, 2.5]);
  const hole = original.bodies[0].faces.find((f) => f.cylinder);
  assert.equal((await inspect(page)).modelingSelection[0].face, hole.id);
  await page.keyboard.press("m");
  await repositionPivot(page, original);
  await quantity(page, "Move faces X", 3);
  let state = await inspect(page);
  assert.deepEqual(state.document, original);
  close(state.preview.bodies[0].faces.find((f) => f.id === hole.id).cylinder.origin[0], 3);
  const input = page.getByRole("textbox", { name: "Face translation X", exact: true });
  await input.fill("20");
  await inspect(page);
  assert.equal(await page.getByRole("button", { name: "Accept face movement" }).isEnabled(), false);
  assert.equal(await input.getAttribute("aria-invalid"), "true");
  await page.keyboard.press("Enter");
  assert.deepEqual((await inspect(page)).document, original);
  await input.fill("2");
  await inspect(page);
  const camera = (await inspect(page)).camera;
  await input.hover();
  await page.mouse.wheel(20, 10);
  await inspect(page);
  assert.notDeepEqual((await inspect(page)).camera.target, camera.target);
  await page.mouse.wheel(-20, -10);
  await inspect(page);
  await page.keyboard.press("Enter");
  const accepted = (await inspect(page)).document;
  close(accepted.bodies[0].faces.find((f) => f.id === hole.id).cylinder.origin[0], 2);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await orient(page, [0.5, 0.5, 1]);
  await quantity(page, "Move faces Y", 1);
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, accepted);
  const button = await page
    .getByRole("button", { name: "Move faces X", exact: true })
    .boundingBox();
  await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2);
  await page.mouse.down();
  await page.mouse.move(button.x + button.width / 2 + 25, button.y + button.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
  state = await inspect(page);
  assert.ok(state.preview);
  assert.deepEqual(state.document, accepted, "Drag release keeps the preview temporary");
  await page.getByRole("button", { name: "Cancel face movement", exact: true }).click();
  await inspect(page);
  if (!electron) await faceMoveRaceRoute(page);
  await page.screenshot({ path: `.cache/sketch-review/${name}-face-move.png` });
  await bodyArchiveRoute(page, `${name}-face-move`, electron);
  await reselectMovedHole(page, hole);
  console.log(
    `${name}: real hole movement, drag preview, rejection recovery, history, cancel and archive passed`,
  );
}
export async function planarFaceMoveRoute(page, name, pocket = false, sides = 4, through = false) {
  const { body, faces } = await makeFeature(page, pocket, sides, through);
  for (let i = 0; i < faces.length; i++)
    await pickFeatureFace(page, faces[i], i > 0, pocket, sides === 0);
  assert.equal((await inspect(page)).modelingSelection.length, faces.length);
  await chooseTool(page, "transform", "transform");
  await quantity(page, "Move faces X", 2);
  let state = await inspect(page);
  assert.ok(state.preview, await page.getByRole("status").textContent());
  close(state.preview.bodies[0].volume, body.volume);
  await page.getByRole("button", { name: "Accept face movement", exact: true }).click();
  await inspect(page);
  await orient(page, [0.5, 0.5, 1]);
  await quantity(page, "Rotate faces Z", 15);
  state = await inspect(page);
  assert.ok(state.preview, await page.getByRole("status").textContent());
  close(state.preview.bodies[0].volume, body.volume);
  await page.screenshot({
    path: `.cache/sketch-review/${name}-${sides}-${through ? "through" : pocket ? "pocket" : "boss"}-face-move.png`,
  });
  await page.keyboard.press("Enter");
  state = await inspect(page);
  assert.deepEqual(
    state.document.bodies[0].faces.map((f) => f.id).sort(),
    body.faces.map((f) => f.id).sort(),
  );
  await chooseTool(page, "undo", "undo");
  await inspect(page);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, state.document);
  console.log(
    `${name}: ${sides || "round"} ${through ? "through" : pocket ? "pocket" : "boss"} pointer selection, translation, rotation and history passed`,
  );
}

async function repositionPivot(page, original) {
  const pivot = page.getByRole("button", { name: "Reposition faces pivot", exact: true });
  const pivotBox = await pivot.boundingBox();
  await page.mouse.move(pivotBox.x + pivotBox.width / 2, pivotBox.y + pivotBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(pivotBox.x + pivotBox.width / 2 + 30, pivotBox.y + pivotBox.height / 2, {
    steps: 4,
  });
  await page.mouse.up();
  assert.deepEqual((await inspect(page)).document, original);
  assert.ok(Math.abs((await pivot.boundingBox()).x - pivotBox.x) > 10);
  await pivot.click(); // Reset the UI-only pivot to the selection center.
}

async function reselectMovedHole(page, hole) {
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await inspect(page);
  await chooseTool(page, "return to modeling", "modeling");
  await inspect(page);
  await orient(page, [0, -Math.sin(0.35), Math.cos(0.35)]);
  await worldClick(page, [2, 1.5, 2.5]);
  assert.equal((await inspect(page)).modelingSelection[0].face, hole.id);
  await page.keyboard.press("m");
  await quantity(page, "Move faces X", 1);
  await chooseTool(page, "offset faces", "offset");
  const state = await inspect(page);
  assert.equal(state.modelingTool, "offset");
  close(state.document.bodies[0].faces.find((f) => f.id === hole.id).cylinder.origin[0], 3);
}
