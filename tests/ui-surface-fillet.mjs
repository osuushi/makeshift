import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DocumentOwner } from "../.cache/sketch-tests/src/backend/document-owner.js";
import { documentArchive } from "../.cache/sketch-tests/src/model/document-archive.js";
import { emptySketch } from "../.cache/sketch-tests/src/sketch/document.js";
import { planes } from "../.cache/sketch-tests/src/sketch/planes.js";
import { prism, square } from "../.cache/sketch-tests/tests/body-edge-fixtures.js";
import { openDocument } from "./native-documents.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { pointerTo } from "./ui-guide-tool-helpers.mjs";
import { inspect, modalCompleted } from "./ui-helpers.mjs";
import { startToolDrag, waitSurfaceLock } from "./ui-surface-snap.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function filletSurfaceFixture(directory) {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const d = 3 * (1 - Math.SQRT1_2),
      point = [d, d, 5];
    const reference = {
      ...emptySketch({ ...planes.XY, origin: [0, 0, 5] }),
      curves: [
        {
          id: "reference",
          kind: "circle",
          center: { x: d, y: d },
          radius: 1,
          construction: true,
        },
      ],
    };
    assert.equal((await owner.call({ kind: "edit", sketch: reference })).error, undefined);
    assert.equal(
      (
        await owner.call({
          kind: "guide-point",
          edit: {
            action: "create",
            name: "Fillet reference",
            anchor: {
              kind: "sketch-curve",
              sketch: reference.id,
              curve: "reference",
              feature: "circle-center",
            },
          },
        })
      ).error,
      undefined,
    );
    const path = join(directory, "surface-fillet.makeshift");
    await writeFile(
      path,
      documentArchive(owner.view.data, {
        position: [-70, -90, 65],
        target: [8, 8, 5],
        up: [0, 0, 1],
        height: 55,
      }),
    );
    return { path, body: body.id, point };
  } finally {
    owner.close();
  }
}

export async function filletSurfaceRoute(page, fixture) {
  await openDocument(page, fixture.path);
  const before = (await inspect(page)).document;
  await worldClick(page, [0, 0, 8]);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "edge");
  await startToolDrag(page, "Fillet edges");
  await pointerTo(page, fixture.point);
  await waitSurfaceLock(page, fixture.point);
  const volume = 4000 - 10 * 9 * (1 - Math.PI / 4);
  const preview = async () => {
    const state = await inspect(page);
    assert.deepEqual(state.document, before);
    assert.equal(state.preview, null);
    assert.ok(state.visualPreview?.bodies[0].faces.length);
    assert.equal(
      await page.getByRole("textbox", { name: "Fillet radius", exact: true }).inputValue(),
      "3",
    );
  };
  await preview();
  await page.keyboard.down("Shift");
  await page.waitForFunction(() => !document.querySelector(".guide-destination-lock"));
  await page.keyboard.up("Shift");
  await waitSurfaceLock(page, fixture.point);
  await page.keyboard.press("g");
  await page.waitForFunction(() => !document.querySelector(".guide-destination-lock"));
  await page.keyboard.press("g");
  await waitSurfaceLock(page, fixture.point);
  await page.screenshot({ path: ".cache/sketch-review/fillet-surface-snap.png" });
  await page.mouse.up();
  await preview();
  // A new gesture must survive cancellation from the previous one, and still
  // acquire the same fitted target after the completed result becomes reusable.
  await startToolDrag(page, "Fillet edges");
  await pointerTo(page, fixture.point);
  await waitSurfaceLock(page, fixture.point);
  await page.mouse.up();
  await preview();
  await page.getByRole("button", { name: "Accept fillet", exact: true }).click();
  await modalCompleted(page);
  assert.ok(
    Math.abs(
      (await inspect(page)).document.bodies.find((body) => body.id === fixture.body).volume -
        volume,
    ) < 1e-5,
  );
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  console.log(
    "Fillet handle fits its rounded surface through a saved guide, preserving preview and Undo",
  );
}
