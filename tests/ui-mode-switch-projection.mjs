import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { at, close, drag, inspect, modalCompleted, pointEquals, reset } from "./ui-helpers.mjs";
import { switchUndoRedo } from "./ui-mode-switch-history.mjs";
import {
  browsePreview,
  knownPreviewHistory,
  rejectPreviewSwitch,
  undoPreview,
} from "./ui-mode-switch-preview-helpers.mjs";
import { pickPlane } from "./ui-plane-targets.mjs";
import { chooseTool } from "./ui-tools.mjs";

function geometry(document, original) {
  assert.equal(document.sketches.length, 2);
  assert.deepEqual(document.sketches[0], original.sketches[0]);
  const result = document.sketches[1];
  assert.deepEqual(result.plane, { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 0, 1] });
  assert.equal(result.curves.length, 1);
  assert.equal(result.curves[0].kind, "segment");
  pointEquals(result.curves[0].a, [-8, 0]);
  pointEquals(result.curves[0].b, [8, 0]);
  assert.notEqual(result.curves[0].id, original.sketches[0].curves[0].id);
  assert.deepEqual(result.constraints, []);
  return result;
}
export async function projectionSwitchRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  if ((await inspect(page)).gridSnap) await chooseTool(page, "grid", "grid");
  await page.keyboard.press("l");
  for (const position of [
    [-8, 3],
    [8, 3],
  ]) {
    const point = await at(page, ...position);
    close(point.x, Math.round(point.x), "fixed source client x");
    close(point.y, Math.round(point.y), "fixed source client y");
  }
  await drag(page, [-8, 3], [8, 3], ["Shift"]);
  const source = (await inspect(page)).document.sketches[0];
  pointEquals(source.curves[0].a, [-8, 3]);
  pointEquals(source.curves[0].b, [8, 3]);
  await chooseTool(page, "return to modeling", "modeling");
  await orient(page, [1, -2, 1]);
  await page.getByRole("button", { name: "Select Sketch 1", exact: true }).click();
  const before = await inspect(page),
    history = await knownPreviewHistory(page, before);
  await chooseTool(page, "Project", "project");
  assert.equal((await inspect(page)).preview, null, "Unfinished target has no preview");
  await chooseTool(page, "Rectangle", "rectangle");
  let state = await inspect(page);
  assert.deepEqual(state.document, before.document);
  assert.equal(state.interaction.kind, "projection");
  assert.equal(state.interaction.phase, "editing");
  assert.equal(state.preview, null);
  assert.notEqual(state.tool, "rectangle");
  assert.match(await page.locator(".local-feedback").textContent(), /valid destination/);
  await pickPlane(page, "XZ");
  geometry((await inspect(page)).preview, before.document);
  await undoPreview(page, before, history);
  await chooseTool(page, "Project", "project");
  await pickPlane(page, "XZ");
  const preview = (await inspect(page)).preview;
  const projected = geometry(preview, before.document);
  await browsePreview(page, "projection", before.document, preview);
  await rejectPreviewSwitch(page, "projection", before, preview);
  await chooseTool(page, "Rectangle", "rectangle");
  await modalCompleted(page);
  state = await inspect(page);
  assert.equal(state.tool, "rectangle");
  assert.equal(state.activeSketch, projected.id);
  geometry(state.document, before.document);
  assert.deepEqual(state.document, preview);
  await switchUndoRedo(page, name, before, history.prior, state.document, "project", {
    sketch: [{ kind: "curve", curve: projected.curves[0].id }],
    modeling: [],
  });
  console.log(
    `${name}: unfinished/rejected Projection retention, Tools borrowing, independent exact projection and ordinary switch/history passed`,
  );
}
