import assert from "node:assert/strict";
import {
  assertNavigation,
  navigationHistory,
  navigationIdle,
  navigationRoundTrip,
  navigationTips,
} from "./ui-navigation-history.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function operationState(page, id) {
  return page.evaluate(
    async (id) => (await window.makeshiftHistory()).find((entry) => entry.id === id)?.state,
    id,
  );
}
function assertCamera(actual, expected) {
  for (const key of ["position", "target", "up", "height"])
    assert.deepEqual(actual.camera[key], expected.camera[key], `Geometry history preserves ${key}`);
}
export async function captureAcceptedRotation(page, action) {
  const beforeRotation = await navigationIdle(page);
  await action();
  const rotation = await page.evaluate(async () =>
    (await window.makeshiftHistory()).findLast(
      (entry) =>
        entry.operation.kind === "place-sketch" &&
        entry.outcome === "changed" &&
        entry.state === "applied",
    ),
  );
  assert.ok(rotation, "The accepted rotation has an identified geometry history entry");
  return { beforeRotation, rotationId: rotation.id };
}
export async function activeModelingHistoryChecks(page, beforeRotation, rotationId) {
  const { before, after } = await navigationRoundTrip(
    page,
    () => chooseTool(page, "edit sketch", "edit-sketch"),
    "Moved sketch entry",
  );
  assert.equal(after.activeSketch, before.document.sketches[0].id);
  const modeling = await navigationHistory(page);
  assertNavigation(modeling, before, "Explicit view Undo before geometry");
  assert.deepEqual(modeling.document, before.document);
  let state = modeling;
  let steps = 0;
  while ((await operationState(page, rotationId)) !== "undone") {
    assert.ok(steps < 5, "Undo reaches the recorded rotation without crossing older geometry");
    state = await navigationHistory(page);
    assertCamera(state, modeling);
    steps++;
  }
  assert.deepEqual(state.document, beforeRotation.document);
  assert.equal(state.activePlane, modeling.activePlane);
  assert.equal(state.activeSketch, modeling.activeSketch);
  assert.equal((await navigationTips(page)).length, 0, "Geometry Undo expires the view tip");
  for (let i = 0; i < steps; i++) {
    state = await navigationHistory(page, true);
    assertCamera(state, modeling);
  }
  assert.equal(await operationState(page, rotationId), "applied");
  assert.deepEqual(state.document, before.document, "Redo restores exactly the rotated document");
  assert.deepEqual(state.modelingSelection, beforeRotation.modelingSelection);
  assert.equal((await navigationTips(page)).length, 0);
  await chooseTool(page, "edit sketch", "edit-sketch");
  state = await navigationIdle(page);
  assertNavigation(state, after, "Explicit sketch reentry after expired view");
  assert.deepEqual(state.document, before.document);
}
