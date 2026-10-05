import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { openDocument } from "./native-documents.mjs";
import { orient, project } from "./ui-blend-edit.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { standaloneOnly } from "./ui-cleanup-controls.mjs";
import { at, drag, inspect, modalCompleted, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function selectBodies(page, count) {
  for (let i = 1; i <= count; i++)
    await page
      .getByRole("button", { name: `Select Body ${i}`, exact: true })
      .click({ modifiers: i > 1 ? ["Shift"] : [] });
}
async function clean(page) {
  await chooseTool(page, "clean up", "cleanup");
  return inspect(page);
}
async function historyTo(page, target, direction = "undo") {
  const depth = (await page.evaluate(() => window.makeshiftHistory())).length;
  for (let i = 0; i < depth; i++) {
    if (isDeepStrictEqual((await inspect(page)).document, target)) return;
    await chooseTool(page, direction, direction);
  }
  assert.ok(
    isDeepStrictEqual((await inspect(page)).document, target),
    `${direction} reaches target geometry`,
  );
}
export async function createStack(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-10, -10], [10, 10]);
  const center = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  for (let i = 0; i < 3; i++) {
    await page.mouse.click(1120, 740);
    await page.mouse.click(center.x, center.y);
    await page.keyboard.press("e");
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
    await page.getByRole("button", { name: "New body", exact: true }).click();
    await page.getByRole("textbox", { name: "Extrusion distance" }).fill("10");
    await inspect(page);
    if (i === 2) {
      await standaloneOnly(page);
      await page.getByRole("button", { name: "Accept extrusion", exact: true }).click();
      await modalCompleted(page);
    } else {
      await page.keyboard.press("Enter");
      await page.keyboard.press("Enter");
    }
    await modalCompleted(page);
    assert.equal((await inspect(page)).document.bodies.length, i + 1);
  }
}
async function cleanupSeamRoutes(page, joined, original, fixturePath) {
  // Actual edge and face clicks: each cleans just one upper side seam.
  await orient(page, [0.3, -1, 0.5]);
  const body = joined.bodies[0];
  const seamZ = fixturePath ? 25 : 20;
  const edgePoint = await project(page, [0, -10, seamZ]);
  await page.mouse.click(edgePoint.x, edgePoint.y);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "edge");
  let state = await clean(page);
  assert.equal(state.preview.bodies[0].faces.length, 13);
  await page.getByRole("button", { name: "Accept cleanup", exact: true }).click();
  await modalCompleted(page);
  assert.equal((await inspect(page)).document.bodies[0].faces.length, 13);
  await historyTo(page, joined);
  const facePoint = await project(page, [0, -10, (seamZ + body.bounds[5]) / 2]);
  await page.mouse.click(facePoint.x, facePoint.y);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "face");
  state = await clean(page);
  assert.equal(state.preview.bodies[0].faces.length, 13);
  await page.keyboard.press("Escape");
  // Undo through selection history to the pre-Boolean geometry.
  await historyTo(page, original);
}
export async function cleanupRoute(page, name, electron, fixturePath) {
  if (fixturePath) {
    await reset(page);
    await openDocument(page, fixturePath);
    await inspect(page);
  } else await createStack(page);
  const original = (await inspect(page)).document;
  assert.equal(original.bodies.length, 3);
  const volume = original.bodies.reduce((n, b) => n + b.volume, 0);
  await selectBodies(page, 3);
  await page.screenshot({ path: `.cache/sketch-review/${name}-cleanup-selection.png` });
  let state = await clean(page);
  await page.screenshot({ path: `.cache/sketch-review/${name}-cleanup-preview.png` });
  assert.deepEqual(state.preview, original, "Cleanup does not join touching bodies");
  const cleanupSelection = state.modelingSelection;
  await page.getByRole("button", { name: "Cancel cleanup", exact: true }).click();
  state = await inspect(page);
  assert.deepEqual(state.document, original);
  assert.deepEqual(state.modelingSelection, cleanupSelection, "Cancel keeps the selection");
  await chooseTool(page, "union", "union");
  await inspect(page);
  await page.getByRole("button", { name: "Accept Boolean", exact: true }).click();
  await modalCompleted(page);
  const joined = (await inspect(page)).document;
  assert.equal(joined.bodies[0].faces.length, 14, "Ordinary commit preserves ribs");
  state = await clean(page);
  assert.equal(state.preview.bodies[0].faces.length, 6);
  assert.equal(state.preview.bodies[0].edges.length, 12);
  assert.deepEqual(state.document, joined);
  const joinedSelection = state.modelingSelection;
  await page.keyboard.press("Escape");
  state = await inspect(page);
  assert.deepEqual(state.document, joined);
  assert.deepEqual(state.modelingSelection, joinedSelection, "Escape keeps the selection");
  await cleanupSeamRoutes(page, joined, original, fixturePath);
  await selectBodies(page, 3);
  await chooseTool(page, "union", "union");
  await inspect(page);
  await standaloneOnly(page);
  await page.getByRole("button", { name: "Accept Boolean", exact: true }).click();
  await modalCompleted(page);
  const ordinary = (await inspect(page)).document;
  assert.equal(ordinary.bodies[0].faces.length, 14);
  await clean(page);
  await page.getByRole("button", { name: "Accept cleanup", exact: true }).click();
  await modalCompleted(page);
  state = await inspect(page);
  assert.equal(state.document.bodies.length, 1);
  assert.equal(state.document.bodies[0].faces.length, 6);
  assert.equal(state.document.bodies[0].edges.length, 12);
  assert.ok(Math.abs(state.document.bodies[0].volume - volume) < 1e-6);
  const saved = state.document;
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, ordinary, "Cleanup has its own Undo step");
  await historyTo(page, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, ordinary);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, saved);
  await selectBodies(page, 1);
  const geometryHistory = async () =>
    (await page.evaluate(() => window.makeshiftHistory()))
      .filter((entry) => entry.outcome === "changed" && entry.operation.kind !== "selection")
      .map((entry) => entry.id);
  const beforeNoOp = await geometryHistory();
  state = await clean(page);
  assert.deepEqual(state.preview, saved);
  await page.keyboard.press("Enter");
  await modalCompleted(page);
  assert.deepEqual(await geometryHistory(), beforeNoOp, "No-op cleanup adds no geometry history");
  await historyTo(page, ordinary);
  await chooseTool(page, "redo", "redo");
  await inspect(page);
  await page.screenshot({ path: `.cache/sketch-review/${name}-cleanup.png` });
  await bodyArchiveRoute(page, `${name}-cleanup`, electron);
  console.log(
    `${name}: cleanup body/face/edge, protected ribs, ordinary completion and separate cleanup, cancel, no-op, Undo/Redo and archive passed`,
  );
}
