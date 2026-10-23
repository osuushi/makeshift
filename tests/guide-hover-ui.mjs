import assert from "node:assert/strict";
import { DocumentOwner } from "../.cache/sketch-tests/src/backend/document-owner.js";
import { documentArchive } from "../.cache/sketch-tests/src/model/document-archive.js";
import { emptySketch } from "../.cache/sketch-tests/src/sketch/document.js";
import { planes } from "../.cache/sketch-tests/src/sketch/planes.js";
import { lift, prism } from "../.cache/sketch-tests/tests/body-edge-fixtures.js";
import { openDocument } from "./native-documents.mjs";
import { project } from "./ui-blend-edit.mjs";
import { inspect } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

const owner = new DocumentOwner();
let archive;
let crowded;
let cylinder;
let concave;
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
  const body = await lift(owner, {
    ...emptySketch(planes.XY),
    curves: [
      { id: "rim", kind: "circle", center: { x: 0, y: 0 }, radius: 20, construction: false },
    ],
  });
  cylinder = documentArchive(
    { ...owner.view.data, sketches: [], bodies: [body] },
    { position: [0, -70, 100], target: [0, 0, 5], up: [0, 1, 0], height: 65 },
  );
  const concaveBody = await prism(owner, [
    [0, 0],
    [60, 0],
    [60, 10],
    [10, 10],
    [10, 60],
    [0, 60],
  ]);
  concave = documentArchive(
    { ...owner.view.data, sketches: [], bodies: [concaveBody] },
    { position: [30, 30, 100], target: [30, 30, 0], up: [0, 1, 0], height: 100 },
  );
} finally {
  owner.close();
}

// Real DOM hit targets must win over the model's canvas listeners. Model tests alone
// cannot catch click-through, overlay double-click handoff or stale hover ghosts.
await withUiRuntimes(async (page, name) => {
  await selectedConcaveFace(page, name);
  await cylinderCap(page, name);
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
  const faceGuides = await page
    .locator(".guide-marker.ghost")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("title")));
  assert.ok(faceGuides.includes("Body bounding-box center · Click to keep"));
  assert.ok(faceGuides.some((title) => title?.startsWith("Edge midpoint")));
  const edge = await project(page, [20, 10, 10]);
  await page.mouse.move(edge.x, edge.y);
  // The guide was exposed from the neighboring face and catches the pointer before
  // the canvas can switch its ordinary hover to the edge underneath.
  assert.equal((await inspect(page)).modelingHover, "face");
  const before = await inspect(page);
  await page.mouse.click(edge.x, edge.y);
  assert.deepEqual((await inspect(page)).modelingSelection, before.modelingSelection);

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
    faceGuides,
  );
  console.log(
    `${name}: face hover exposes neighboring edge guides; those guides retain click precedence`,
  );
});

// Hover-derived marker membership changes while crossing the rim; only pointer
// traversal through the real overlay can prove the center remains reachable.
async function cylinderCap(page, name) {
  await openDocument(page, {
    name: "guide-cylinder.makeshift",
    mimeType: "application/json",
    buffer: Buffer.from(cylinder),
  });
  const cap = await project(page, [0, 0, 10]);
  const side = await project(page, [0, -20, 7]);
  await page.mouse.move(side.x, side.y);
  assert.equal((await inspect(page)).modelingHover, "face");
  await page.mouse.move(cap.x, cap.y, { steps: 30 });
  const marker = page.locator('.guide-marker.ghost[title*="Face circle center"]');
  await marker.waitFor({ state: "visible" });
  assert.equal(await marker.locator(".guide-count").textContent(), "4");
  assert.equal(
    await page.evaluate(
      ({ x, y }) => !!document.elementFromPoint(x, y)?.closest(".guide-marker"),
      cap,
    ),
    true,
    "the cap center owns the actual pointer hit after crossing from the side",
  );
  const before = (await inspect(page)).document;
  await page.mouse.click(cap.x, cap.y);
  const choices = page.locator(".guide-choices");
  await choices.waitFor({ state: "visible" });
  assert.equal(await choices.locator('button[aria-pressed="true"]').count(), 1);
  await page.mouse.click(1200, 780);
  await page.waitForFunction(() => window.makeshiftInspect().document.guidePoints?.length === 1);
  assert.equal((await inspect(page)).document.guidePoints[0].anchor.kind, "body-edge");
  await chooseTool(page, "undo", "undo");
  await page.mouse.move(cap.x, cap.y);
  await page.mouse.click(cap.x, cap.y);
  await choices.waitFor({ state: "visible" });
  await page.keyboard.press("Escape");
  assert.equal(await choices.isVisible(), false);
  assert.deepEqual((await inspect(page)).document, before);
  await page.mouse.click(cap.x, cap.y);
  await choices.waitFor({ state: "visible" });
  await page.mouse.move(1200, 780);
  await choices.waitFor({ state: "hidden" });
  await page.waitForFunction(() => window.makeshiftInspect().document.guidePoints?.length === 1);
  assert.equal(
    (await inspect(page)).document.guidePoints[0].anchor.kind,
    "body-edge",
    "dismissal keeps the default meaning",
  );
  await chooseTool(page, "undo", "undo");
  await page.mouse.move(cap.x, cap.y);
  await page.mouse.click(cap.x, cap.y);
  await choices.waitFor({ state: "visible" });
  await page.screenshot({ path: `.cache/sketch-review/${name}-guide-cylinder-center.png` });
  await choices.getByRole("button", { name: "Face circle center", exact: true }).click();
  await page.waitForFunction(() => window.makeshiftInspect().document.guidePoints?.length === 1);
  const after = (await inspect(page)).document;
  assert.equal(after.guidePoints[0].anchor.kind, "body-faces");
  assert.equal(after.guidePoints[0].anchor.feature, "circle-center");
  assert.deepEqual(after.bodies, before.bodies);
  assert.equal(await page.locator(".guide-marker.saved").count(), 1);
  console.log(
    `${name}: cylinder cap centers share a reachable marker and save the chosen definition`,
  );
  await overlappingSavedGuides(page, after);
}

async function overlappingSavedGuides(page, document) {
  const first = document.guidePoints[0];
  const archive = documentArchive(
    {
      ...document,
      guidePoints: [
        first,
        {
          ...first,
          id: "overlapping-guide",
          name: "Overlapping guide",
          anchor: { ...first.anchor, feature: "bounds-center" },
        },
      ],
    },
    { position: [0, -70, 100], target: [0, 0, 5], up: [0, 1, 0], height: 65 },
  );
  await openDocument(page, {
    name: "overlapping-guides.makeshift",
    mimeType: "application/json",
    buffer: Buffer.from(archive),
  });
  await page.locator(".guide-marker.saved").dblclick();
  assert.equal(
    (await inspect(page)).document.guidePoints.length,
    2,
    "overlapping guides survive double-click",
  );
  await page.keyboard.press("Delete");
  await page.waitForFunction(() => window.makeshiftInspect().document.guidePoints.length === 1);
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.guidePoints.length, 2);
}

async function selectedConcaveFace(page, name) {
  await openDocument(page, {
    name: "guide-concave.makeshift",
    mimeType: "application/json",
    buffer: Buffer.from(concave),
  });
  const state = await inspect(page);
  const face = state.document.bodies[0].faces.find(
    (f) => f.plane && Math.abs(f.signature[5] - 10) < 1e-6,
  );
  const centroid = await project(page, face.signature.slice(3, 6));
  const inside = await project(page, [8, 8, 10]);
  const marker = page.locator('.guide-marker.ghost[title*="Face area centroid"]');
  await page.mouse.move(inside.x, inside.y);
  assert.equal((await inspect(page)).modelingHover, "face");
  assert.equal(await marker.count(), 0, "off-face centroid must not appear from hover alone");
  await page.mouse.click(inside.x, inside.y);
  assert.equal((await inspect(page)).modelingSelection[0]?.face, face.id);
  await marker.waitFor({ state: "visible" });
  await page.mouse.move(1200, 780);
  assert.equal((await inspect(page)).modelingHover, null);
  assert.equal(await marker.count(), 0, "selection does not bypass the pointer radius");
  await page.screenshot({ path: `.cache/sketch-review/${name}-guide-selected-proximity.png` });
  await page.mouse.click(1200, 780);
  assert.equal(await marker.count(), 0, "deselection removes the candidate");
  await page.mouse.click(inside.x, inside.y);
  await page.mouse.move(centroid.x, centroid.y, { steps: 20 });
  await page.mouse.click(centroid.x, centroid.y);
  await page.waitForFunction(() => window.makeshiftInspect().document.guidePoints?.length === 1);
  const after = await inspect(page);
  assert.equal(after.document.guidePoints[0].anchor.feature, "area-center");
  assert.equal(after.modelingSelection[0]?.face, face.id);
  assert.deepEqual(after.document.bodies, state.document.bodies);
  console.log(
    `${name}: off-face centroid hidden on hover, selected within pointer range, reachable and saveable`,
  );
}
