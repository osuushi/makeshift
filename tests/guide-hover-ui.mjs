import assert from "node:assert/strict";
import { DocumentOwner } from "../.cache/sketch-tests/src/backend/document-owner.js";
import { documentArchive } from "../.cache/sketch-tests/src/model/document-archive.js";
import { prism } from "../.cache/sketch-tests/tests/body-edge-fixtures.js";
import { openDocument } from "./native-documents.mjs";
import { project } from "./ui-blend-edit.mjs";
import { inspect } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

const owner = new DocumentOwner();
let archive;
let crowded;
try {
  await prism(owner, [
    [0, 0],
    [20, 0],
    [20, 20],
    [0, 20],
  ]);
  crowded = documentArchive(
    { ...owner.view.data, sketches: [] },
    { position: [10, 10, 100], target: [10, 10, 0], up: [0, 1, 0], height: 160 },
  );
  archive = documentArchive(
    { ...owner.view.data, sketches: [] },
    {
      position: [80, 70, 100],
      target: [10, 10, 5],
      up: [0, 1, 0],
      height: 30,
    },
  );
} finally {
  owner.close();
}

// Real DOM hit targets must win over the model's canvas listeners. Model tests alone
// cannot catch click-through, overlay double-click handoff or stale hover ghosts.
await withUiRuntimes(async (page, name) => {
  await openDocument(page, {
    name: "guide-crowded.makeshift",
    mimeType: "application/json",
    buffer: Buffer.from(crowded),
  });
  const crowdedEdge = await project(page, [20, 10, 10]);
  await page.mouse.move(crowdedEdge.x, crowdedEdge.y);
  assert.equal((await inspect(page)).modelingHover, "edge");
  assert.equal(await page.locator(".guide-marker.ghost").count(), 0);
  await page.mouse.click(crowdedEdge.x, crowdedEdge.y);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "edge");
  await openDocument(page, {
    name: "guide-hover.makeshift",
    mimeType: "application/json",
    buffer: Buffer.from(archive),
  });
  const face = await project(page, [10, 10, 10]);
  await page.mouse.move(face.x, face.y);
  assert.equal((await inspect(page)).modelingHover, "face");
  assert.deepEqual(
    await page
      .locator(".guide-marker.ghost")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("title"))),
    ["Body bounding-box center · Double-click to keep"],
  );
  const edge = await project(page, [20, 10, 10]);
  await page.mouse.move(edge.x, edge.y);
  assert.equal((await inspect(page)).modelingHover, "edge");
  const ghost = page.locator('.guide-marker.ghost[title^="Edge midpoint"]');
  assert.equal(await ghost.count(), 1);
  assert.match(await ghost.getAttribute("title"), /Edge midpoint/);
  const before = await inspect(page);
  await page.mouse.click(edge.x, edge.y);
  assert.deepEqual((await inspect(page)).modelingSelection, before.modelingSelection);
  assert.deepEqual((await inspect(page)).document, before.document);
  await page.mouse.dblclick(edge.x, edge.y);
  await page.waitForFunction(() => window.makeshiftInspect().document.guidePoints?.length === 1);
  assert.deepEqual((await inspect(page)).modelingSelection, before.modelingSelection);
  const saved = page.locator(".guide-marker.saved");
  await saved.click();
  assert.deepEqual((await inspect(page)).modelingSelection, before.modelingSelection);
  await page.keyboard.press("Delete");
  const after = await inspect(page);
  assert.equal(after.document.guidePoints.length, 0);
  assert.deepEqual(after.document.bodies, before.document.bodies);
  await page.mouse.move(face.x, face.y);
  assert.equal((await inspect(page)).modelingHover, "face");
  assert.deepEqual(
    await page
      .locator(".guide-marker.ghost")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("title"))),
    ["Body bounding-box center · Double-click to keep"],
  );
  console.log(
    `${name}: spaced hover candidates retain guide click precedence over native geometry`,
  );
});
