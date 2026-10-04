import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { close, drag, inspect, reset } from "./ui-helpers.mjs";
import {
  assertNavigation,
  navigationHistory,
  navigationIdle,
  navigationTips,
} from "./ui-navigation-history.mjs";
import { pickPlane } from "./ui-plane-targets.mjs";
import { chooseTool } from "./ui-tools.mjs";

const button = (page, name) => page.getByRole("button", { name, exact: true });
const field = (page, name) => page.getByRole("textbox", { name, exact: true });

async function tiltedRectangle(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  if ((await inspect(page)).gridSnap) await chooseTool(page, "grid snap", "grid");
  await page.keyboard.press("r");
  await drag(page, [-10, -5], [10, 5]);
  for (const [name, value] of [
    ["Width", 20],
    ["Height", 10],
  ]) {
    await field(page, name).fill(String(value));
    await page.keyboard.press("Enter");
    await inspect(page);
  }
  const source = (await inspect(page)).document.sketches[0];
  const area =
    Math.abs(
      source.curves.reduce((sum, curve) => {
        assert.equal(curve.kind, "segment");
        return sum + curve.a.x * curve.b.y - curve.a.y * curve.b.x;
      }, 0),
    ) / 2;
  close(area, 200, "independent precise source area");
  await chooseTool(page, "return to modeling", "modeling");
  await button(page, "Select Sketch 1").click();
  await orient(page, [1, 1, 1]);
  await chooseTool(page, "transform", "transform");
  await button(page, "Rotate sketch X").click();
  await field(page, "Rotation X").fill("45");
  await page.keyboard.press("Enter");
  await navigationIdle(page);
  await page.keyboard.press("Escape");
  await button(page, "Select Sketch 1").click();
  const state = await navigationIdle(page);
  assert.deepEqual(state.document.sketches[0].plane.u, [1, 0, 0]);
  close(state.document.sketches[0].plane.v[1], Math.SQRT1_2);
  close(state.document.sketches[0].plane.v[2], Math.SQRT1_2);
  return state;
}

function projectedRectangle(sketch) {
  assert.ok(sketch);
  assert.deepEqual(sketch.plane, { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0] });
  const points = sketch.curves.flatMap((curve) => {
    assert.equal(curve.kind, "segment");
    return [curve.a, curve.b];
  });
  close(
    Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x)),
    20,
  );
  close(
    Math.max(...points.map((point) => point.y)) - Math.min(...points.map((point) => point.y)),
    10 * Math.SQRT1_2,
  );
}

export async function projectionHistoryRoute(page, name) {
  const source = await tiltedRectangle(page);
  await chooseTool(page, "project", "project");
  await pickPlane(page, "XY");
  const beforeEntry = await navigationIdle(page);
  const destination = beforeEntry.preview.sketches.find(
    (sketch) => sketch.id !== source.document.sketches[0].id,
  );
  projectedRectangle(destination);
  await button(page, "Accept projection").click();
  await page.waitForFunction(() => window.makeshiftInspect().interaction === null);
  const afterEntry = await navigationIdle(page),
    accepted = afterEntry.document;
  assert.equal(afterEntry.activeSketch, destination.id);
  assert.equal(afterEntry.activePlane, "Projected sketch");
  projectedRectangle(accepted.sketches.find((sketch) => sketch.id === destination.id));
  assert.deepEqual(afterEntry.modelingSelection, []);
  assert.deepEqual(
    afterEntry.selectionTargets,
    destination.curves.map((curve) => ({ kind: "curve", curve: curve.id })),
  );
  const history = await page.evaluate(() => window.makeshiftHistory());
  const geometric = history.findLast(
    (entry) =>
      entry.state === "applied" &&
      entry.outcome === "changed" &&
      !["navigation", "selection"].includes(entry.operation.kind),
  );
  assert.equal(geometric.operation.kind, "project");
  assert.equal(geometric.operation.parameters.projection.sketchId, destination.id);
  assert.deepEqual(geometric.operation.parameters.projection.frame, destination.plane);
  assert.equal((await navigationTips(page)).length, 1);
  const geometryResult = await navigationHistory(page);
  assert.deepEqual(geometryResult.document, accepted, "completion view Undo leaves exact geometry");
  assertNavigation(geometryResult, beforeEntry, "Projection view Undo");
  const restoredView = await navigationHistory(page, true);
  assert.deepEqual(restoredView.document, accepted);
  assertNavigation(restoredView, afterEntry, "Projection view Redo");
  // The known view tip must be undone before the next ordinary Undo reaches geometry.
  assertNavigation(await navigationHistory(page), beforeEntry);
  const undone = await navigationHistory(page);
  assert.deepEqual(
    undone.document,
    source.document,
    "next ordinary Undo restores exact projection input",
  );
  assert.deepEqual(undone.modelingSelection, source.modelingSelection);
  assert.deepEqual(undone.selectionTargets, source.selectionTargets);
  const redone = await navigationHistory(page, true);
  assert.deepEqual(redone.document, accepted, "ordinary Redo restores exact projected geometry");
  assert.deepEqual(redone.modelingSelection, geometryResult.modelingSelection);
  assert.deepEqual(redone.selectionTargets, geometryResult.selectionTargets);
  await button(page, "Select Sketch 2").click();
  await page.keyboard.press("Enter");
  const entered = await navigationIdle(page);
  assert.equal(
    entered.activeSketch,
    destination.id,
    "projected current geometry remains editable through ordinary workspace entry",
  );
  assert.deepEqual(entered.document, accepted);
  await page.screenshot({ path: `.cache/sketch-review/${name}-projection-history.png` });
  console.log(
    `${name}: ordinary Projection exact destination/extents, view Undo/Redo, geometry Undo/Redo and ordered selections passed`,
  );
}
