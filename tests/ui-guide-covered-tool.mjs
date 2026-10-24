import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DocumentOwner } from "../.cache/sketch-tests/src/backend/document-owner.js";
import { documentArchive } from "../.cache/sketch-tests/src/model/document-archive.js";
import { emptySketch } from "../.cache/sketch-tests/src/sketch/document.js";
import { planes } from "../.cache/sketch-tests/src/sketch/planes.js";
import { profilesFor } from "../.cache/sketch-tests/src/sketch/profiles.js";
import { openDocument } from "./native-documents.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { assertPreview, beginDrag, pointerTo, waitLock } from "./ui-guide-tool-helpers.mjs";
import { inspect, modalCompleted } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Reduced from the founder's 2026-10-22T18:51:43.765Z capture: a profile on
// a cylinder cap, with a saved side-face centroid inside the solid below it.
export async function coveredGuideFixture(directory) {
  const owner = new DocumentOwner();
  const circle = (height, radius) => ({
    ...emptySketch({ ...planes.XY, origin: [0, 0, height] }),
    curves: [{ id: "circle", kind: "circle", center: { x: 0, y: 0 }, radius, construction: false }],
  });
  try {
    const base = circle(0, 9);
    assert.equal((await owner.call({ kind: "edit", sketch: base })).error, undefined);
    assert.equal(
      (
        await owner.call({
          kind: "extrude",
          extrusion: {
            sources: [{ sketch: base.id, profile: profilesFor(base)[0].key }],
            distance: 20,
            mode: "new",
          },
        })
      ).error,
      undefined,
    );
    await owner.call({ kind: "accept" });
    const body = owner.view.data.bodies[0];
    const rim = body.edges.find(
      (edge) => edge.curve?.kind === "circle" && edge.curve.center[2] === 20,
    );
    const wall = body.faces.find((face) => face.cylinder);
    assert.ok(rim && wall);
    const profile = circle(20, 5);
    assert.equal((await owner.call({ kind: "edit", sketch: profile })).error, undefined);
    for (const [name, anchor] of [
      ["Handle", { kind: "body-edge", body: body.id, edge: rim.id, feature: "circle-center" }],
      ["Inside", { kind: "body-faces", body: body.id, faces: [wall.id], feature: "area-center" }],
    ]) {
      assert.equal(
        (await owner.call({ kind: "guide-point", edit: { action: "create", name, anchor } })).error,
        undefined,
      );
    }
    const path = join(directory, "guide-covered.makeshift");
    await writeFile(
      path,
      documentArchive(owner.view.data, {
        position: [80, -100, 80],
        target: [0, 0, 12],
        up: [0, 0, 1],
        height: 55,
      }),
    );
    return { path, body: body.id };
  } finally {
    owner.close();
  }
}

// A numeric solve alone cannot detect the mismatch between a visible saved
// marker and the occlusion filter used by pointer hit testing.
export async function coveredGuideRoute(page, fixture) {
  for (const tool of ["extrude", "offset"]) {
    await openDocument(page, fixture.path);
    const before = (await inspect(page)).document;
    await worldClick(page, tool === "extrude" ? [2, 1, 20] : [7, 0, 20]);
    assert.equal(
      (await inspect(page)).modelingSelection[0]?.kind,
      tool === "extrude" ? "profile" : "face",
    );
    if (tool === "extrude") await page.keyboard.press("e");
    const handle = page.locator('.guide-marker[title^="Handle"]');
    const inside = page.locator('.guide-marker[title^="Inside"]');
    assert.equal(await handle.evaluate((e) => e.classList.contains("start-unavailable")), false);
    assert.equal(await inside.evaluate((e) => e.classList.contains("start-unavailable")), true);
    assert.equal(await inside.evaluate((e) => getComputedStyle(e).color), "rgb(146, 154, 163)");
    await inside.click();
    assert.equal(
      await inside.getAttribute("aria-pressed"),
      "true",
      "gray guides remain selectable",
    );
    if (tool === "extrude") {
      await page.screenshot({ path: ".cache/sketch-review/guide-start-availability.png" });
    }
    await beginDrag(page);
    await pointerTo(page, [0, 0, 10]);
    await waitLock(page, [0, 0, 10]);
    assert.equal(
      await inside.evaluate((e) => e.classList.contains("start-unavailable")),
      false,
      "a valid destination is not dimmed by its starting-point eligibility",
    );
    assert.equal(await page.locator('.guide-marker[title^="Inside"]').count(), 1);
    assert.equal(
      await page.locator(".guide-move-choices").isVisible(),
      false,
      "a single reachable saved marker locks without a hold chooser",
    );
    await page.mouse.up();
    const volume = Math.PI * (tool === "extrude" ? 81 * 20 - 25 * 10 : 81 * 10);
    await assertPreview(page, before, fixture.body, volume);
    await page
      .getByRole("button", {
        name: tool === "extrude" ? "Accept extrusion" : "Accept face offset",
        exact: true,
      })
      .click();
    await modalCompleted(page);
    assert.ok(Math.abs((await inspect(page)).document.bodies[0].volume - volume) < 1e-5);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, before);
    if (tool === "offset") {
      await worldClick(page, [7, 0, 20]);
      await page.keyboard.press("m");
      assert.equal(await inside.evaluate((e) => e.classList.contains("start-unavailable")), false);
      await page.keyboard.press("o");
      assert.equal(await inside.evaluate((e) => e.classList.contains("start-unavailable")), true);
    }
  }
  console.log("Saved centroid inside its body snaps directly for Extrude and Offset with one Undo");
}
