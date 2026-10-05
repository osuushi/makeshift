import assert from "node:assert/strict";
import { resolve } from "node:path";
import { openDocument, saveDocument } from "./native-documents.mjs";
import { orient, project } from "./ui-blend-edit.mjs";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { assertNavigation, navigationHistory, navigationIdle } from "./ui-navigation-history.mjs";
import { chooseTool } from "./ui-tools.mjs";
export async function projectionRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-20, -15], [20, 15]);
  const center = await at(page, 5, 5);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("5");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.mouse.click(center.x, center.y);
  await chooseTool(page, "sketch on face", "sketch-on-face");
  await page.keyboard.press("c");
  await drag(page, [0, 0], [6, 0]);
  const circle = (await inspect(page)).document.sketches.at(-1);
  const circlePoint = await at(page, 6, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(circlePoint.x, circlePoint.y);
  await inspect(page);
  await chooseTool(page, "transform", "transform");
  await orient(page, [1, 1, 1]);
  await page.getByRole("button", { name: "Rotate sketch X", exact: true }).click();
  await page.getByRole("textbox", { name: "Rotation X", exact: true }).fill("45");
  await page.keyboard.press("Enter");
  await inspect(page);
  await orient(page, [0, 0, 1]);
  await chooseTool(page, "project", "project");
  await inspect(page);
  await page.mouse.click(center.x, center.y);
  let state = await inspect(page);
  assert.ok(state.preview, "face-target projection has a preview");
  const projected = state.preview.sketches.find(
    (s) => s.id !== circle.id && s.curves.some((c) => c.kind === "bezier"),
  );
  assert.ok(projected);
  await page.getByRole("button", { name: "Accept projection", exact: true }).click();
  state = await navigationIdle(page);
  assert.equal(state.activeSketch, projected.id);
  assert.ok(
    state.document.sketches
      .find((s) => s.id === projected.id)
      .curves.some((c) => c.kind === "bezier"),
  );
  const accepted = state.document;
  const acceptedView = state;
  const beforeView = await navigationHistory(page);
  assert.deepEqual(beforeView.document, accepted, "Projection view Undo retains geometry");
  assertNavigation(await navigationHistory(page, true), acceptedView, "Projection view Redo");
  await navigationHistory(page);
  await chooseTool(page, "undo", "undo");
  state = await inspect(page);
  assert.ok(!state.document.sketches.some((s) => s.curves.some((c) => c.kind === "bezier")));
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  const targetIndex = accepted.sketches.findIndex((sketch) => sketch.id === projected.id) + 1;
  await page.getByRole("button", { name: `Select Sketch ${targetIndex}`, exact: true }).click();
  await page.keyboard.press("Enter");
  assert.equal((await navigationIdle(page)).activeSketch, projected.id);
  await projectActiveEdge(page, projected.id);
  await page.screenshot({ path: `.cache/sketch-review/${name}-projection.png` });
  await archive(page, name);
  console.log(
    `${name}: face-target cubic projection, coplanar reuse, active sketch edge projection, preview/cancel/Undo passed`,
  );
}

async function projectActiveEdge(page, sketchId) {
  let state = await inspect(page);
  const source = state.document.sketches.find((sketch) => sketch.id !== sketchId);
  assert.ok(source);
  const sourceIndex = state.document.sketches.indexOf(source) + 1;
  const targetIndex = state.document.sketches.findIndex((sketch) => sketch.id === sketchId) + 1;
  await chooseTool(page, "return to modeling", "modeling");
  await page.getByRole("button", { name: `Select Sketch ${sourceIndex}`, exact: true }).click();
  await page.keyboard.press("Enter");
  await page.keyboard.press("l");
  // The rotated source line must lie below the active XY plane to remain pickable through clipping.
  await drag(page, [10, -10], [16, -10]);
  const editedSource = (await inspect(page)).document.sketches.find(
    (sketch) => sketch.id === source.id,
  );
  const line = editedSource?.curves.find((curve) => curve.kind === "segment");
  assert.ok(line);
  const midpoint = [(line.a.x + line.b.x) / 2, (line.a.y + line.b.y) / 2];
  const world = [0, 1, 2].map(
    (axis) =>
      editedSource.plane.origin[axis] +
      editedSource.plane.u[axis] * midpoint[0] +
      editedSource.plane.v[axis] * midpoint[1],
  );
  await chooseTool(page, "return to modeling", "modeling");
  await page.getByRole("button", { name: `Select Sketch ${targetIndex}`, exact: true }).click();
  await page.keyboard.press("Enter");
  const beforeProjection = (await inspect(page)).document;
  const beforeSegments = beforeProjection.sketches
    .find((sketch) => sketch.id === sketchId)
    .curves.filter((curve) => curve.kind === "segment").length;
  await chooseTool(page, "project", "project");
  await inspect(page);
  const edge = await project(page, world);
  await page.mouse.click(edge.x, edge.y);
  state = await inspect(page);
  assert.ok(state.preview, "active sketch edge projection preview");
  await page.getByRole("button", { name: "Cancel projection", exact: true }).click();
  assert.deepEqual((await inspect(page)).document, beforeProjection);
  await chooseTool(page, "project", "project");
  await inspect(page);
  await page.mouse.click(edge.x, edge.y);
  await inspect(page);
  await page.getByRole("button", { name: "Accept projection", exact: true }).click();
  state = await inspect(page);
  assert.ok(
    state.document.sketches
      .find((sketch) => sketch.id === sketchId)
      .curves.filter((curve) => curve.kind === "segment").length > beforeSegments,
  );
}

async function archive(page, name) {
  const before = (await inspect(page)).document;
  const file = resolve(`.cache/sketch-review/${name}-projection.makeshift`);
  await saveDocument(page, file);
  await reset(page);
  await openDocument(page, file);
  await page.waitForFunction(
    (count) => window.makeshiftInspect().document.sketches.length === count,
    before.sketches.length,
  );
  assert.deepEqual((await inspect(page)).document.sketches, before.sketches);
  const projectedIndex =
    before.sketches.findIndex((sketch) => sketch.curves.some((curve) => curve.kind === "bezier")) +
    1;
  await page.getByRole("button", { name: `Select Sketch ${projectedIndex}`, exact: true }).click();
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press(process.platform === "darwin" ? "Meta+a" : "Control+a");
  await inspect(page);
  assert.ok(await page.locator('[data-handle="c1"][data-curve]').count());
}
