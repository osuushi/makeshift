import assert from "node:assert/strict";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Regresses command dispatch and native touch replay before canonical-plane capture.
await withUiRuntimes(
  async (page) => {
    await reset(page);
    await chooseTool(page, "Sketch on XZ", "sketch-xz");
    await page.keyboard.press("l");
    await drag(page, [-20, 0], [20, 0]);
    const first = (await inspect(page)).document.sketches[0];
    await chooseTool(page, "return to modeling", "modeling");
    await chooseTool(page, "Sketch on XY", "sketch-xy");
    await page.keyboard.press("l");
    await drag(page, [-20, 12], [20, 12]);
    const point = await at(page, 0, 12);
    const before = await inspect(page);
    await chooseTool(page, "return to modeling", "modeling");
    await page.getByRole("button", { name: "Select Sketch 1", exact: true }).click();
    await page.keyboard.press("Meta+Enter");
    assert.equal((await inspect(page)).activeSketch, first.id, "selected XZ wins over primary XY");
    await chooseTool(page, "return to modeling", "modeling");
    await chooseTool(page, "Sketch on XY", "sketch-xy");
    await chooseTool(page, "return to modeling", "modeling");
    await page.touchscreen.tap(point.x, point.y + 18);
    await page.touchscreen.tap(point.x + 8, point.y + 18);
    const after = await inspect(page);
    assert.equal(
      after.activeSketch,
      before.document.sketches[1].id,
      "finger near ink enters its sketch",
    );
    assert.deepEqual(after.document, before.document, "entry creates no duplicate sketch");
    await page.keyboard.press("l");
    await drag(page, [-10, -12], [10, -12]);
    const edited = await inspect(page);
    assert.equal(edited.document.sketches.length, 2);
    assert.equal(
      edited.document.sketches[1].curves.length,
      2,
      "drawing continues the existing sketch",
    );
    console.log("Selected sketch shortcut and tolerant native touch entry pass");
  },
  { allowed: ["chromium"], hasTouch: true },
);
