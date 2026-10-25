import assert from "node:assert/strict";
import { holdPreviews, previewReady, previewStats } from "./ui-decorator-worker-control.mjs";
import { drag, inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Signature unit tests cannot prove that overlay/queue wiring retains visible meshes.
export async function gearPreviewStability(page) {
  await previewReady(page);
  const before = await inspect(page);
  const stats = await previewStats(page);
  await holdPreviews(page);
  try {
    await chooseTool(page, "Sketch on XY", "sketch-xy");
    await page.keyboard.press("c");
    await drag(page, [0, 10], [3, 10]);
    const after = await inspect(page);
    const count = (state) =>
      state.document.sketches.reduce((n, sketch) => n + sketch.curves.length, 0);
    assert.ok(count(after) > count(before), "actual pointer gesture creates sketch geometry");
    assert.deepEqual(after.document.decorators, before.document.decorators);
    assert.deepEqual(after.decoratorPreviewBounds, before.decoratorPreviewBounds);
    assert.equal(
      (await previewStats(page)).posts,
      stats.posts,
      "sketch edits queue no gear preview work",
    );
    await chooseTool(page, "return to modeling", "modeling");
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).decoratorPreviewBounds, before.decoratorPreviewBounds);
    assert.equal(
      (await previewStats(page)).posts,
      stats.posts,
      "undo retains the same gear previews",
    );
    console.log(
      "Gear previews stay visible with worker replies held during sketch creation and Undo",
    );
  } finally {
    await holdPreviews(page, false);
  }
}
