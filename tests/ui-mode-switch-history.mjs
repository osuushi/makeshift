import assert from "node:assert/strict";
import { inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function appliedSwitchHistory(page) {
  return page.evaluate(async () =>
    (await window.makeshiftHistory()).filter((entry) => entry.state === "applied"),
  );
}

/** Verify the known edit and only its explicitly observed selection suffix. */
export async function switchUndoRedo(page, name, before, prior, accepted, kind, selection) {
  const after = await inspect(page),
    applied = await appliedSwitchHistory(page);
  const geometry = applied.filter((entry) => entry.operation.kind !== "selection");
  const originalGeometry = prior.filter((entry) => entry.operation.kind !== "selection");
  assert.equal(geometry.length, originalGeometry.length + 1);
  assert.deepEqual(
    geometry.slice(0, -1).map((entry) => entry.id),
    originalGeometry.map((entry) => entry.id),
  );
  const edit = geometry.at(-1);
  assert.equal(edit.operation.kind, kind);
  const suffix = applied.slice(applied.findIndex((entry) => entry.id === edit.id) + 1);
  assert.ok(
    suffix.length <= 1,
    "Only the known ordinary selection transition may follow this edit",
  );
  for (const entry of suffix) assert.equal(entry.operation.kind, "selection");
  console.log(
    `${name}: checked applied edit/selection suffix`,
    [edit, ...suffix].map((entry) => ({ id: entry.id, kind: entry.operation.kind })),
  );
  for (const entry of [...suffix].reverse()) {
    assert.equal((await appliedSwitchHistory(page)).at(-1).id, entry.id);
    await chooseTool(page, "undo", "undo");
    const state = await inspect(page);
    assert.deepEqual(state.document, accepted);
    assert.deepEqual(state.selectionTargets, selection.sketch);
    assert.deepEqual(state.modelingSelection, selection.modeling);
  }
  assert.equal((await appliedSwitchHistory(page)).at(-1).id, edit.id);
  const resultSelection = await inspect(page);
  await chooseTool(page, "undo", "undo");
  const undone = await inspect(page);
  assert.deepEqual(undone.document, before.document);
  assert.deepEqual(undone.selectionTargets, before.selectionTargets);
  assert.deepEqual(undone.modelingSelection, before.modelingSelection);
  await chooseTool(page, "redo", "redo");
  const redone = await inspect(page);
  assert.deepEqual(redone.document, accepted);
  assert.deepEqual(redone.selectionTargets, resultSelection.selectionTargets);
  assert.deepEqual(redone.modelingSelection, resultSelection.modelingSelection);
  for (const entry of suffix) {
    assert.equal(
      (await page.evaluate(() => window.makeshiftHistory())).find(
        (candidate) => candidate.id === entry.id,
      ).state,
      "undone",
    );
    await chooseTool(page, "redo", "redo");
    const state = await inspect(page);
    assert.deepEqual(state.document, accepted);
  }
  const final = await inspect(page);
  assert.deepEqual(final.selectionTargets, after.selectionTargets);
  assert.deepEqual(final.modelingSelection, after.modelingSelection);
}
