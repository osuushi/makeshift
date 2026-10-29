import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { documentArchive } from "../.cache/sketch-tests/src/model/document-archive.js";
import { emptySketch } from "../.cache/sketch-tests/src/sketch/document.js";
import { planes } from "../.cache/sketch-tests/src/sketch/planes.js";
import { openDocument } from "./native-documents.mjs";
import { pointerTo } from "./ui-guide-tool-helpers.mjs";
import { inspect } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Exercises shared gizmo pointer capture and release into the plane preview owner.
// Projection unit tests cannot catch a missing hook in that event path.
await mkdir(".cache/axis-guide", { recursive: true });
const sketch = {
  ...emptySketch(planes.XY),
  curves: [
    { id: "line", kind: "segment", construction: false, a: { x: 30, y: 25 }, b: { x: 40, y: 25 } },
  ],
};
const path = resolve(".cache/axis-guide/fixture.makeshift");
await writeFile(
  path,
  documentArchive(
    {
      units: "mm",
      sketches: [sketch],
      bodies: [],
      constructionPlanes: [{ id: "plane", frame: { ...planes.YZ, origin: [5, 0, 8] } }],
      guidePoints: [
        {
          id: "guide",
          name: "Target",
          hidden: false,
          anchor: {
            kind: "sketch-curve",
            sketch: sketch.id,
            curve: "line",
            feature: "start",
          },
        },
      ],
    },
    { position: [90, -110, 100], target: [15, 10, 0], up: [0, 0, 1], height: 100 },
  ),
);
await withUiRuntimes(async (page) => {
  await openDocument(page, path);
  const original = (await inspect(page)).document;
  for (const shift of [false, true]) {
    await page.getByRole("button", { name: "Select Plane 1", exact: true }).first().click();
    await chooseTool(page, "transform", "transform");
    const box = await page.getByRole("button", { name: "Move plane X", exact: true }).boundingBox();
    assert.ok(box);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    if (shift) await page.keyboard.down("Shift");
    await pointerTo(page, [30, 25, 0]);
    await page.mouse.up();
    if (shift) await page.keyboard.up("Shift");
    const origin = (await inspect(page)).document.constructionPlanes[0].frame.origin;
    if (shift) assert.ok(Math.abs(origin[0] - 30) > 0.1);
    else assert.ok(Math.abs(origin[0] - 30) < 1e-8);
    assert.deepEqual(origin.slice(1), [0, 8]);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, original);
  }
  console.log("Plane arrow guide alignment, Shift bypass and Undo passed");
});
