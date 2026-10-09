import assert from "node:assert/strict";
import { pixels, tinted } from "./ui-fill.mjs";
import { click, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function curvedRegionRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  const samples = [
    [2.3, 2.7],
    [11.3, 11.3],
    [21.3, 11.3],
  ];
  const blank = await pixels(page, samples);
  await page.keyboard.press("c");
  await drag(page, [0, 0], [13, 0]);
  const radius = (await inspect(page)).document.sketches[0].curves[0].radius;
  await page.keyboard.press("l");
  await drag(page, [0, radius], [20, 20]);
  await drag(page, [20, 20], [radius, 0]);
  await page.keyboard.press("Escape");
  let filled = await pixels(page, samples);
  tinted(blank[0], filled[0]);
  tinted(blank[1], filled[1]);
  assert.deepEqual(filled[2], blank[2]);
  const doc = (await inspect(page)).document;
  await page.screenshot({ path: `.cache/sketch-review/${name}-curved-region.png` });
  // The former failure changed with the circle's display sampling at each zoom.
  for (const delta of [-30, 60, -30]) {
    await page.mouse.move(640, 425);
    const height = (await inspect(page)).camera.height;
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, delta);
    await page.keyboard.up("Control");
    await page.waitForFunction(
      (before) => window.makeshiftInspect().camera.height !== before,
      height,
    );
    filled = await pixels(page, samples);
    assert.ok(
      filled[1][2] - filled[1][0] > 15,
      "Arc-bounded wedge stays visibly filled through zoom",
    );
    assert.deepEqual((await inspect(page)).document, doc);
  }
  await page.keyboard.press("v");
  await click(page, 18.25, 15);
  await chooseTool(page, "delete", "delete");
  const afterDelete = await inspect(page);
  assert.equal(
    afterDelete.document.sketches[0].curves.length,
    2,
    "Delete removes one boundary line",
  );
  const opened = await pixels(page, samples);
  assert.ok(
    opened[1][0] > filled[1][0] + 10,
    `Removing a line opens the exterior region: ${JSON.stringify({ filled, opened, selection: afterDelete.selection, curves: afterDelete.document.sketches[0].curves })}`,
  );
  tinted(blank[0], opened[0]);
  await chooseTool(page, "undo", "undo");
  tinted(opened[1], (await pixels(page, samples))[1]);
  assert.deepEqual((await inspect(page)).document, doc);
  console.log(`${name}: circle/line wedge fill, zoom-invariant closure and Delete/Undo passed`);
}
