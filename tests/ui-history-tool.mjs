import assert from "node:assert/strict";
import { drag, reset } from "./ui-helpers.mjs";
import { navigationIdle } from "./ui-navigation-history.mjs";
import { chooseTool } from "./ui-tools.mjs";

// The renderer's history-selection restoration used to switch to Select after
// every document Undo. Model-only history tests cannot catch that input failure.
export async function historyToolRoute(page, name) {
  for (const [tool, shortcut, count] of [
    ["rectangle", "r", 4],
    ["line", "l", 1],
    ["circle", "c", 1],
  ]) {
    await reset(page);
    await chooseTool(page, "Sketch on XY", "sketch-xy");
    await navigationIdle(page);
    await page.keyboard.press(shortcut);
    await drag(page, [-20, -10], [-10, 0]);
    const drawn = await navigationIdle(page);
    assert.equal(drawn.document.sketches[0].curves.length, count);
    await page.keyboard.press("ControlOrMeta+z");
    const undone = await navigationIdle(page);
    assert.equal(undone.document.sketches.flatMap((sketch) => sketch.curves).length, 0);
    assert.equal(undone.tool, tool, "Undo keeps the drawing tool");
    await page.keyboard.press("ControlOrMeta+Shift+z");
    const redone = await navigationIdle(page);
    assert.deepEqual(redone.document, drawn.document);
    assert.equal(redone.tool, tool, "Redo keeps the drawing tool");
    await page.keyboard.press("ControlOrMeta+z");
    await navigationIdle(page);
    await drag(page, [10, 10], [20, 20]);
    const continued = await navigationIdle(page);
    assert.equal(continued.tool, tool);
    assert.equal(continued.document.sketches[0].curves.length, count);
    assert.notDeepEqual(continued.document, drawn.document, "The next drag draws new geometry");
  }
  console.log(`${name}: Rectangle, Line and Circle stay active through Undo/Redo and draw again`);
}
