import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { drag, inspect, reset } from "./ui-helpers.mjs";
import { findRaycastPoint } from "./ui-plane-targets.mjs";
import { chooseTool } from "./ui-tools.mjs";

const references = {
  XY: { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0] },
  XZ: { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 0, 1] },
  YZ: { origin: [0, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
};
async function select(page, id) {
  if (!(await inspect(page)).planeTargets.find((p) => p.id === id)?.selectable)
    await orient(page, { XY: [0.2, 0.2, 1], XZ: [0.2, 1, 0.2], YZ: [1, 0.2, 0.2] }[id]);
  const point = await findRaycastPoint(page, id);
  await page.mouse.click(point.x, point.y);
  await page.getByRole("button", { name: "Application settings" }).hover();
  const state = await inspect(page);
  assert.equal(state.activePlane, null);
  assert.equal(state.planeTargets.find((p) => p.id === id).selected, true);
  return point;
}
export async function canonicalPlanesRoute(page, name) {
  for (const [id, frame] of Object.entries(references)) {
    await reset(page);
    const original = (await inspect(page)).document;
    await select(page, id);
    await page.keyboard.press("Backspace");
    assert.deepEqual((await inspect(page)).document, original, "World references stay fixed");
    await page.keyboard.press("Escape");
    assert.ok((await inspect(page)).planeTargets.every((p) => !p.selected));
    await select(page, id);
    const canvas = await page.locator("canvas").boundingBox();
    await page.mouse.click(canvas.x + 8, canvas.y + canvas.height - 8);
    assert.ok(
      (await inspect(page)).planeTargets.some((p) => p.selected),
      "Full-view references remain selectable far from origin",
    );
    await page.keyboard.press("Escape");
    assert.ok(
      (await inspect(page)).planeTargets.every((p) => !p.selected),
      "Escape clears selection",
    );
    await select(page, id);
    await chooseTool(page, "cross section", "cross-section");
    const section = (await inspect(page)).crossSection;
    assert.deepEqual(section.origin, frame.origin, "Selection seeds cross section");
    assert.deepEqual(section.u, frame.u);
    assert.deepEqual(section.v.map(Math.abs), frame.v);
    await page.keyboard.press("Escape");
    assert.equal((await inspect(page)).crossSection, null);
    await select(page, id);
    await chooseTool(page, "construction plane", "construction-plane");
    let state = await inspect(page);
    assert.deepEqual(state.preview.constructionPlanes[0].frame, frame, "Selection seeds placement");
    assert.deepEqual(state.document, original);
    await page.keyboard.press("Escape");
    assert.deepEqual((await inspect(page)).document, original, "Cancel creates nothing");
    await select(page, id);
    await chooseTool(page, "construction plane", "construction-plane");
    const axis = { XY: "Z", XZ: "Y", YZ: "X" }[id];
    await orient(page, [1, 1, 1]);
    await page.getByRole("button", { name: `Move plane ${axis}`, exact: true }).click();
    await page.getByRole("textbox", { name: `Plane translation ${axis}`, exact: true }).fill("8");
    await page.keyboard.press("Enter");
    state = await inspect(page);
    const origin = { XY: [0, 0, 8], XZ: [0, 8, 0], YZ: [8, 0, 0] }[id];
    assert.deepEqual(state.document.constructionPlanes[0].frame, { ...frame, origin });
    await chooseTool(page, "undo", "undo");
    assert.equal((await inspect(page)).document.constructionPlanes?.length ?? 0, 0);
    await chooseTool(page, "redo", "redo");
    assert.deepEqual((await inspect(page)).document.constructionPlanes[0].frame.origin, origin);
    await page.getByRole("button", { name: "Select Plane 1", exact: true }).click();
    await chooseTool(page, "construction plane", "construction-plane");
    state = await inspect(page);
    assert.equal(
      state.preview.constructionPlanes.length,
      2,
      "Saved selection also seeds a new plane",
    );
    assert.deepEqual(state.preview.constructionPlanes[1].frame, { ...frame, origin });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Select Plane 1", exact: true }).click();
    await page.keyboard.press("Enter");
    await chooseTool(page, "rectangle", "rectangle");
    await drag(page, [0, 0], [10, 10]);
    assert.deepEqual((await inspect(page)).document.sketches[0].plane, { ...frame, origin });
    await chooseTool(page, "return to modeling", "modeling");
    await orient(page, [1, 1, 1]);
    await select(page, id);
    await page.keyboard.press("Enter");
    await chooseTool(page, "rectangle", "rectangle");
    await drag(page, [0, 0], [-10, -10]);
    state = await inspect(page);
    assert.equal(state.document.sketches.length, 2);
    assert.deepEqual(state.document.sketches[1].plane, frame, "Enter draws on the world reference");
    await chooseTool(page, "return to modeling", "modeling");
    console.log(
      name,
      id,
      "selection, placement, cancel, Undo/Redo and real sketch geometry passed",
    );
  }
}
