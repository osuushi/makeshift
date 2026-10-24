import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DocumentOwner } from "../.cache/sketch-tests/src/backend/document-owner.js";
import { guideCandidates } from "../.cache/sketch-tests/src/guides/candidates.js";
import { documentArchive } from "../.cache/sketch-tests/src/model/document-archive.js";
import { prism, square } from "../.cache/sketch-tests/tests/body-edge-fixtures.js";
import { openDocument } from "./native-documents.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { coveredGuideFixture, coveredGuideRoute } from "./ui-guide-covered-tool.mjs";
import { cylinderToolFixture, cylinderToolRoute } from "./ui-guide-cylinder-tool.mjs";
import { profileToolFixture, profileToolRoute } from "./ui-guide-profile-tool.mjs";
import {
  assertPreview,
  beginDrag,
  holdGuideSettling,
  pointerTo,
  releaseGuideSettling,
  waitLock,
} from "./ui-guide-tool-helpers.mjs";
import { inspect, modalCompleted } from "./ui-helpers.mjs";
import { relativeOffsetInput } from "./ui-offset-input.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { filletSurfaceFixture, filletSurfaceRoute } from "./ui-surface-fillet.mjs";
import { surfaceCylinderRoute, surfaceToolRoute } from "./ui-surface-snap.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function existingOffsetRoute(page, before, body) {
  await worldClick(page, [7, 8, 10]);
  await page
    .locator(".face-offset-widget")
    .getByRole("button", { name: "Offset faces", exact: true })
    .click();
  await (await relativeOffsetInput(page)).fill("2");
  await inspect(page);
  await beginDrag(page);
  await pointerTo(page, [20, 20, 18]);
  await waitLock(page, [20, 20, 18]);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await assertPreview(page, before, body, 4800);
  await holdGuideSettling(page);
  try {
    await beginDrag(page);
    await pointerTo(page, [20, 20, 18]);
    await page.waitForFunction(() => window.guideSettling.reached);
    await page.mouse.up();
    await page.evaluate(() => new Promise(requestAnimationFrame));
    const interaction = (await inspect(page)).interaction;
    assert.equal(interaction?.kind, "face-offset");
    assert.equal(interaction?.phase, "editing");
  } finally {
    await releaseGuideSettling(page);
  }
  await assertPreview(page, before, body, 7200);
  await chooseTool(page, "undo", "undo");
  await assertPreview(page, before, body, 4800);
  await chooseTool(page, "redo", "redo");
  await assertPreview(page, before, body, 7200);
  await page.keyboard.press("Escape");
  await modalCompleted(page);
}

// Model tests cannot catch guide pointer capture stealing a tool's edit lease,
// default Offset dispatch, or release prematurely accepting an Extrude preview.
const directory = await mkdtemp(join(tmpdir(), "makeshift-guide-tools-"));
const owner = new DocumentOwner();
try {
  const body = await prism(owner, square);
  const target = await prism(
    owner,
    square.map(([x, y]) => [x + 45, y]),
  );
  assert.equal(
    (
      await owner.call({
        kind: "transform-bodies",
        transform: {
          ids: [target.id],
          pivot: [0, 0, 0],
          axis: [0, 0, 1],
          angle: 0,
          translation: [0, 0, 8],
          duplicate: false,
        },
      })
    ).error,
    undefined,
  );
  for (const [id, point, name] of [
    [body.id, [20, 20, 10], "Handle"],
    [target.id, [45, 0, 18], "Reference"],
  ]) {
    const candidate = guideCandidates(owner.view.data, [{ kind: "body", body: id }]).find(
      (p) =>
        p.anchor.kind === "body-junction" &&
        Math.hypot(...p.point.map((v, i) => v - point[i])) < 1e-7,
    );
    assert.ok(candidate);
    assert.equal(
      (
        await owner.call({
          kind: "guide-point",
          edit: { action: "create", anchor: candidate.anchor, name },
        })
      ).error,
      undefined,
    );
  }
  const path = join(directory, "guide-tools.makeshift");
  await writeFile(
    path,
    documentArchive(owner.view.data, {
      position: [85, -90, 110],
      target: [25, 10, 0],
      up: [0, 0, 1],
      height: 85,
    }),
  );
  owner.close();
  const cylinder = await cylinderToolFixture(directory);
  const profile = await profileToolFixture(directory);
  const covered = await coveredGuideFixture(directory);
  const fillet = await filletSurfaceFixture(directory);
  await withUiRuntimes(async (page) => {
    await openDocument(page, path);
    const before = (await inspect(page)).document;
    await worldClick(page, [7, 8, 10]);
    assert.equal((await inspect(page)).modelingSelection[0]?.kind, "face");
    const vector = page.locator(".guide-move-vector");
    await beginDrag(page);
    await pointerTo(page, [45, 0, 18]);
    assert.equal(
      await vector.getAttribute("data-end"),
      "",
      "unreachable point is not a snap target",
    );
    assert.equal(
      await page.locator('.guide-marker[title^="Reference"]').count(),
      0,
      "unreachable saved guides are omitted during the constrained gesture",
    );
    const dots = await page
      .locator(".guide-move-destinations circle[data-point]")
      .evaluateAll((els) => els.map((e) => JSON.parse(e.dataset.point)));
    assert.ok(!dots.some((p) => Math.hypot(...p.map((v, i) => v - [45, 0, 18][i])) < 1e-7));
    await pointerTo(page, [20, 20, 18]);
    await waitLock(page, [20, 20, 18]);
    assert.equal(await page.locator(".guide-face-plane-patch").count(), 1);
    assert.equal(
      (await inspect(page)).interaction.kind,
      "face-offset",
      "default face tool owns the drag",
    );
    await page.screenshot({ path: ".cache/sketch-review/guide-tool-offset.png" });
    await page.mouse.up();
    await assertPreview(page, before, body.id, 7200);
    await page.getByRole("button", { name: "Accept face offset", exact: true }).click();
    await modalCompleted(page);
    assert.ok(
      Math.abs((await inspect(page)).document.bodies.find((b) => b.id === body.id).volume - 7200) <
        1e-5,
    );
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, before);

    // Canceling a guide gesture restores a previously typed temporary value.
    await existingOffsetRoute(page, before, body.id);

    await worldClick(page, [7, 8, 10]);
    await page.keyboard.press("e");
    await beginDrag(page);
    await pointerTo(page, [20, 20, 18]);
    await waitLock(page, [20, 20, 18]);
    await page.mouse.up();
    await assertPreview(page, before, body.id, 7200);
    assert.equal((await inspect(page)).interaction.kind, "extrude");
    await page.getByRole("button", { name: "Accept extrusion", exact: true }).click();
    await modalCompleted(page);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, before);
    await cylinderToolRoute(page, cylinder);
    await profileToolRoute(page, profile);
    await coveredGuideRoute(page, covered);
    await surfaceToolRoute(page, path, body.id);
    await surfaceCylinderRoute(page, cylinder);
    await filletSurfaceRoute(page, fillet);
    console.log(
      "Guide tool dispatch, unreachable destinations, temporary Offset/Extrude, gesture cancel and Undo passed",
    );
  });
} finally {
  owner.close();
  await rm(directory, { recursive: true, force: true });
}
