import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DocumentOwner } from "../.cache/sketch-tests/src/backend/document-owner.js";
import { documentArchive } from "../.cache/sketch-tests/src/model/document-archive.js";
import { emptySketch } from "../.cache/sketch-tests/src/sketch/document.js";
import { planes } from "../.cache/sketch-tests/src/sketch/planes.js";
import { lift } from "../.cache/sketch-tests/tests/body-edge-fixtures.js";
import { openDocument } from "./native-documents.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { assertPreview, beginDrag, pointerTo, waitLock } from "./ui-guide-tool-helpers.mjs";
import { inspect, modalCompleted } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function cylinderToolFixture(directory) {
  const owner = new DocumentOwner();
  try {
    const body = await lift(owner, {
      ...emptySketch(planes.XY),
      curves: [
        {
          id: "circle",
          kind: "circle",
          center: { x: 0, y: 0 },
          radius: 5,
          construction: false,
        },
      ],
    });
    for (const [point, name] of [
      [[5, 0, 15], "Handle"],
      [[0, 8, 0], "Reference"],
    ]) {
      const sketch = {
        ...emptySketch({ ...planes.XY, origin: [0, 0, point[2]] }),
        curves: [
          {
            id: "segment",
            kind: "segment",
            a: { x: point[0], y: point[1] },
            b: { x: point[0] + 2, y: point[1] },
            construction: true,
          },
        ],
      };
      assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
      assert.equal(
        (
          await owner.call({
            kind: "guide-point",
            edit: {
              action: "create",
              name,
              anchor: {
                kind: "sketch-curve",
                sketch: sketch.id,
                curve: "segment",
                feature: "start",
              },
            },
          })
        ).error,
        undefined,
      );
    }
    const path = join(directory, "guide-cylinder.makeshift");
    await writeFile(
      path,
      documentArchive(owner.view.data, {
        position: [35, -60, 40],
        target: [0, 0, 7],
        up: [0, 0, 1],
        height: 40,
      }),
    );
    return { path, body: body.id };
  } finally {
    owner.close();
  }
}

export async function cylinderToolRoute(page, fixture) {
  await openDocument(page, fixture.path);
  const before = (await inspect(page)).document;
  for (const tool of ["offset", "extrude"]) {
    await worldClick(page, [3, -4, 5]);
    assert.equal((await inspect(page)).modelingSelection[0]?.kind, "face");
    if (tool === "extrude") await page.keyboard.press("e");
    await beginDrag(page);
    await pointerTo(page, [8, 0, 15]);
    // Nearby construction-curve radii intentionally require the ordinary chooser.
    const choice = page.locator('.guide-move-choices button[data-point="[8,0,15]"]');
    await choice.waitFor({ state: "visible" });
    await choice.hover();
    await waitLock(page, [8, 0, 15]);
    assert.match(await page.locator(".guide-move-vector").getAttribute("data-target"), /Radius/);
    assert.ok(await page.locator(".guide-cylinder-patch").count());
    await page.screenshot({ path: `.cache/sketch-review/guide-tool-cylinder-${tool}.png` });
    await page.mouse.up();
    await assertPreview(page, before, fixture.body, Math.PI * 64 * 10);
    await page
      .getByRole("button", {
        name: tool === "offset" ? "Accept face offset" : "Accept extrusion",
        exact: true,
      })
      .click();
    await modalCompleted(page);
    const result = (await inspect(page)).document;
    assert.deepEqual(
      result.sketches,
      before.sketches,
      "virtual guide support never moves its sketch",
    );
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, before);
  }
  console.log(
    "Cylinder extension guide solves Offset/Extrude radius with unchanged reference sketches",
  );
}
