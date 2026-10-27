import assert from "node:assert/strict";
import { plate } from "./ui-body-fillet.mjs";
import { drag, inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function bodySelectionEntryRoute(page, name) {
  const { center, top } = await plate(page);
  center.x -= 60;
  center.y -= 60;
  top.x -= 60;
  const original = (await inspect(page)).document;
  const body = original.bodies[0];
  for (const point of [center, { x: center.x + 60, y: center.y + 60 }, top]) {
    await page.mouse.dblclick(point.x, point.y);
    const state = await inspect(page);
    assert.equal(state.activePlane, null);
    assert.deepEqual(state.modelingSelection, [{ kind: "body", body: body.id }]);
    assert.deepEqual(state.document, original);
    await page.keyboard.press("Enter");
    assert.equal((await inspect(page)).activePlane, null);
  }
  await page.mouse.click(center.x, center.y);
  let state = await inspect(page);
  assert.equal(state.modelingSelection[0].kind, "face");
  const face = body.faces.find((face) => face.id === state.modelingSelection[0].face);
  await page.keyboard.press("Meta+Enter");
  state = await inspect(page);
  assert.ok(state.activePlane);
  assert.deepEqual(state.document, original, "Workspace entry creates no empty sketch");
  await page.keyboard.press("l");
  await drag(page, [-3, 0], [3, 0]);
  state = await inspect(page);
  assert.deepEqual(state.document.sketches.at(-1).plane, face.plane);
  assert.equal(state.document.sketches.at(-1).curves.length, 1);
  assert.equal(state.document.bodies[0].brep, body.brep);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, state.document);
  await chooseTool(page, "return to modeling", "modeling");
  await chooseTool(page, "hide bodies", "hide-bodies");
  await page.getByRole("button", { name: "Show Sketch 1", exact: true }).click();
  await page.mouse.dblclick(top.x, top.y);
  assert.equal((await inspect(page)).activeSketch, original.sketches[0].id);
  console.log(`${name}: body double-click, face Cmd-Enter/drawing/history and sketch entry passed`);
}
