import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { inspect, modalCompleted } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function standaloneOnly(page) {
  assert.equal(
    await page.getByRole("button", { name: "Commit and clean up", exact: true }).count(),
    0,
  );
  assert.equal(await page.locator(".commit-cleanup").count(), 0);
}

export async function cleanBodySeparately(page, original) {
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await chooseTool(page, "clean up", "cleanup");
  const first = await inspect(page);
  assert.deepEqual(first.document, original);
  assert.ok(
    first.preview.bodies[0].faces.length < original.bodies[0].faces.length ||
      first.preview.bodies[0].edges.length < original.bodies[0].edges.length,
  );
  assert.ok(Math.abs(first.preview.bodies[0].volume - original.bodies[0].volume) < 1e-6);
  assert.equal(first.preview.bodies[0].id, original.bodies[0].id);
  await page.getByRole("button", { name: "Cancel cleanup", exact: true }).click();
  const cancelled = await inspect(page);
  assert.deepEqual(cancelled.document, original);
  assert.deepEqual(cancelled.modelingSelection, first.modelingSelection);
  const geometryHistory = async () =>
    (await page.evaluate(() => window.makeshiftHistory()))
      .filter((entry) => entry.outcome === "changed" && entry.operation.kind !== "selection")
      .map((entry) => entry.id);
  const beforeCleanup = await geometryHistory();
  await chooseTool(page, "clean up", "cleanup");
  const preview = (await inspect(page)).preview;
  assert.deepEqual((await inspect(page)).document, original);
  const repeated = preview.bodies[0],
    firstBody = first.preview.bodies[0];
  assert.equal(repeated.id, original.bodies[0].id);
  assert.deepEqual(repeated.bounds, firstBody.bounds);
  assert.ok(Math.abs(repeated.volume - firstBody.volume) < 1e-6);
  for (const key of ["faces", "edges"]) {
    assert.equal(repeated[key].length, firstBody[key].length);
    const originalIds = new Set(original.bodies[0][key].map((item) => item.id));
    const survivors = (body) =>
      body[key].map((item) => item.id).filter((id) => originalIds.has(id));
    assert.deepEqual(survivors(repeated), survivors(firstBody));
  }
  await page.getByRole("button", { name: "Accept cleanup", exact: true }).click();
  await modalCompleted(page);
  const cleaned = (await inspect(page)).document;
  assert.deepEqual(cleaned, preview);
  assert.equal(
    (await geometryHistory()).length,
    beforeCleanup.length + 1,
    "Standalone cleanup adds exactly one separate geometry history step",
  );
  await chooseTool(page, "undo", "undo");
  assert.deepEqual(
    (await inspect(page)).document,
    original,
    "One Undo restores ordinary operation result",
  );
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, cleaned);
  return cleaned;
}

// Selection is ordinary Undo history; reach the previous exact geometry without
// assuming that changing face selection to whole-body selection has no history.
export async function undoToDocument(page, target) {
  const depth = (await page.evaluate(() => window.makeshiftHistory())).length;
  for (let i = 0; i < depth; i++) {
    if (isDeepStrictEqual((await inspect(page)).document, target)) return;
    await chooseTool(page, "undo", "undo");
  }
  assert.deepEqual((await inspect(page)).document, target);
}
