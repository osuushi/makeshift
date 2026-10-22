import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DocumentOwner } from "../.cache/sketch-tests/src/backend/document-owner.js";
import { documentArchive } from "../.cache/sketch-tests/src/model/document-archive.js";
import { emptySketch } from "../.cache/sketch-tests/src/sketch/document.js";
import { planes } from "../.cache/sketch-tests/src/sketch/planes.js";
import { square } from "../.cache/sketch-tests/tests/body-edge-fixtures.js";
import { openDocument } from "./native-documents.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { beginDrag, pointerTo, waitLock } from "./ui-guide-tool-helpers.mjs";
import { inspect, modalCompleted } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function profileToolFixture(directory) {
  const owner = new DocumentOwner();
  try {
    const profile = {
      ...emptySketch(planes.XY),
      curves: square.map(([x, y], i) => ({
        id: `line${i}`,
        kind: "segment",
        a: { x, y },
        b: { x: square[(i + 1) % 4][0], y: square[(i + 1) % 4][1] },
        construction: false,
      })),
    };
    assert.equal((await owner.call({ kind: "edit", sketch: profile })).error, undefined);
    assert.equal(
      (
        await owner.call({
          kind: "guide-point",
          edit: {
            action: "create",
            name: "Handle",
            anchor: { kind: "sketch-curve", sketch: profile.id, curve: "line2", feature: "start" },
          },
        })
      ).error,
      undefined,
    );
    const reference = {
      ...emptySketch({ ...planes.XY, origin: [0, 0, 8] }),
      curves: [
        {
          id: "reference",
          kind: "segment",
          a: { x: 45, y: 0 },
          b: { x: 50, y: 0 },
          construction: true,
        },
      ],
    };
    assert.equal((await owner.call({ kind: "edit", sketch: reference })).error, undefined);
    const path = join(directory, "guide-profile.makeshift");
    await writeFile(
      path,
      documentArchive(owner.view.data, {
        position: [85, -90, 110],
        target: [25, 10, 0],
        up: [0, 0, 1],
        height: 85,
      }),
    );
    return path;
  } finally {
    owner.close();
  }
}

export async function profileToolRoute(page, path) {
  await openDocument(page, path);
  const before = (await inspect(page)).document;
  await worldClick(page, [7, 8, 0]);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "profile");
  await beginDrag(page);
  await pointerTo(page, [20, 20, 8]);
  await waitLock(page, [20, 20, 8]);
  await page.mouse.up();
  const state = await inspect(page);
  assert.equal(state.interaction.kind, "extrude", "profile default owns the guide gesture");
  assert.deepEqual(state.document, before);
  assert.ok(Math.abs(state.preview.bodies[0].volume - 3200) < 1e-5);
  await page.getByRole("button", { name: "Accept extrusion", exact: true }).click();
  await modalCompleted(page);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  console.log("Profile default Extrude solves guide height and retains temporary acceptance");
}
