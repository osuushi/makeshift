import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DocumentOwner } from "../.cache/sketch-tests/src/backend/document-owner.js";
import { guideCandidates } from "../.cache/sketch-tests/src/guides/candidates.js";
import { guidePosition } from "../.cache/sketch-tests/src/guides/evaluate.js";
import { documentArchive } from "../.cache/sketch-tests/src/model/document-archive.js";
import { prism, square } from "../.cache/sketch-tests/tests/body-edge-fixtures.js";
import { openDocument } from "./native-documents.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { guideDisambiguation } from "./ui-guide-disambiguation.mjs";
import { planeDestinationRoute } from "./ui-guide-plane-destination.mjs";
import { inspect, modalCompleted } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

const directory = await mkdtemp(join(tmpdir(), "makeshift-guide-move-"));
const owner = new DocumentOwner();
try {
  const source = await prism(owner, square);
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
  for (const [body, name, point] of [
    [source.id, "Source anchor", [20, 20, 10]],
    [target.id, "Target anchor", [45, 0, 18]],
  ]) {
    const candidate = guideCandidates(owner.view.data, [{ kind: "body", body }]).find(
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
  const path = join(directory, "guide-move.makeshift");
  await writeFile(
    path,
    documentArchive(owner.view.data, {
      position: [30, 10, 120],
      target: [30, 10, 0],
      up: [0, 1, 0],
      height: 80,
    }),
  );
  owner.close();
  await withUiRuntimes(async (page, name) => {
    await openDocument(page, path);
    const before = (await inspect(page)).document;
    const marker = (name) => page.locator(`.guide-marker[title^="${name}"]`);
    const a = await center(marker("Source anchor")),
      b = await center(marker("Target anchor"));
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x + 2, b.y + 1, { steps: 8 });
    assert.equal((await inspect(page)).interaction.kind, "guide-move");
    assert.deepEqual((await inspect(page)).document, before);
    const vector = page.locator(".guide-move-vector");
    assert.deepEqual(JSON.parse(await vector.getAttribute("data-start")), [20, 20, 10]);
    assert.deepEqual(JSON.parse(await vector.getAttribute("data-end")), [45, 0, 18]);
    await page.mouse.up();
    await modalCompleted(page);
    let state = await inspect(page);
    const guide = state.document.guidePoints.find((g) => g.name === "Source anchor");
    assert.ok(guide);
    const point = guidePosition(state.document, guide.anchor);
    assert.ok(Math.hypot(...point.map((v, i) => v - [45, 0, 18][i])) < 1e-6, JSON.stringify(point));
    assert.equal(state.document.bodies.find((b) => b.id === source.id).volume, source.volume);
    assert.deepEqual(
      state.document.bodies.find((b) => b.id === target.id),
      before.bodies.find((b) => b.id === target.id),
    );
    await chooseTool(page, "undo", "undo");
    state = await inspect(page);
    assert.deepEqual(state.document, before);
    await page
      .locator(".entity-viewer")
      .getByRole("button", { name: "Select Body 1", exact: true })
      .click();
    await page.keyboard.press("m");
    await snapPivot(page, b);
    assert.deepEqual((await inspect(page)).document, before);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 5 });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await modalCompleted(page);
    assert.deepEqual((await inspect(page)).document, before);
    await page.keyboard.down("Alt");
    try {
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(b.x + 2, b.y + 1, { steps: 5 });
      await page.mouse.up();
      await modalCompleted(page);
    } finally {
      await page.mouse.up();
      await page.keyboard.up("Alt");
    }
    state = await inspect(page);
    assert.equal(state.document.bodies.length, 3);
    assert.equal(state.document.guidePoints.length, 3);
    assert.deepEqual(
      state.document.bodies.find((b) => b.id === source.id),
      before.bodies.find((b) => b.id === source.id),
    );
    const copied = state.document.guidePoints.find(
      (g) => g.name === "Source anchor" && g.id !== guide.id,
    );
    assert.ok(copied);
    const copyPoint = guidePosition(state.document, copied.anchor);
    assert.ok(Math.hypot(...copyPoint.map((v, i) => v - [45, 0, 18][i])) < 1e-6);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, before);
    await savedMarkerRoute(page, name, before);
    await guideDisambiguation(page, name, source.id);
    await faceAndPlaneRoute(page, { a, b, before, source, guide });
    console.log(
      `${name}: direct guide drag, selected-face Move, normal plane target, fixed vector, copy, delete, Undo, Shift and Escape passed`,
    );
  });
} finally {
  owner.close();
  await rm(directory, { recursive: true, force: true });
}

async function center(locator) {
  const box = await locator.boundingBox();
  assert.ok(box);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function snapPivot(page, b) {
  const pivot = page.getByRole("button", { name: "Reposition body pivot", exact: true });
  const pivotStart = await center(pivot);
  const pivotOffset = await pivot.evaluate((el) =>
    getComputedStyle(el).translate.split(" ").map(Number.parseFloat),
  );
  await page.mouse.move(pivotStart.x, pivotStart.y);
  await page.mouse.down();
  await page.mouse.move(b.x + 2 + (pivotOffset[0] || 0), b.y + 1 + (pivotOffset[1] || 0), {
    steps: 6,
  });
  assert.equal(await pivot.getAttribute("data-snapped"), "true");
  await page.mouse.up();
  await inspect(page);
  // Clearance may move the glyph aside; the gizmo root remains the actual projected anchor.
  const pivotEnd = await pivot.evaluate((el) => {
    const root = el.parentElement.getBoundingClientRect();
    return { x: root.x, y: root.y };
  });
  assert.ok(Math.hypot(pivotEnd.x - b.x, pivotEnd.y - b.y) < 0.1, JSON.stringify({ pivotEnd, b }));
}

async function faceAndPlaneRoute(page, { a, b, before, source, guide }) {
  const vector = page.locator(".guide-move-vector");
  // A guide supplies the displacement; an explicit Move face remains the source.
  await page.keyboard.press("v");
  await worldClick(page, [7, 8, 10]);
  const selectedFace = (await inspect(page)).modelingSelection[0];
  assert.equal(selectedFace.kind, "face");
  await page.keyboard.press("m");
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  assert.equal((await inspect(page)).interaction.kind, "guide-move");
  assert.deepEqual((await inspect(page)).modelingSelection, [selectedFace]);
  await page.mouse.up();
  await modalCompleted(page);
  const movedFaceBody = (await inspect(page)).document.bodies.find((body) => body.id === source.id);
  assert.ok(Math.abs(movedFaceBody.volume - 7200) < 1e-5, JSON.stringify(movedFaceBody.bounds));
  assert.ok(Math.abs(movedFaceBody.bounds[2]) < 1e-5, "bottom stays fixed during top-face Move");
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await page.keyboard.press("v");
  await page.mouse.click(650, 700);
  assert.deepEqual((await inspect(page)).modelingSelection, []);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.keyboard.down("Shift");
  await page.mouse.move(b.x, b.y, { steps: 5 });
  assert.equal(await vector.getAttribute("data-end"), "");
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await modalCompleted(page);
  assert.deepEqual((await inspect(page)).document, before);
  await planeDestinationRoute(page, before, source, guide);
}

async function savedMarkerRoute(page, name, before) {
  const marker = (name) => page.locator(`.guide-marker[title^="${name}"]`);
  await marker("Source anchor").click();
  assert.equal(await marker("Source anchor").getAttribute("aria-pressed"), "true");
  assert.equal(await marker("Source anchor").locator("svg path").count(), 1);
  assert.equal(
    await marker("Source anchor").evaluate((el) => getComputedStyle(el).color),
    "rgb(22, 118, 210)",
  );
  await page.screenshot({ path: `.cache/sketch-review/${name}-guide-selected.png` });
  await marker("Source anchor").dblclick();
  assert.deepEqual((await inspect(page)).document, before, "double-click selects without deleting");
  await page.keyboard.press("Delete");
  const state = await inspect(page);
  assert.equal(state.document.guidePoints.length, 1);
  assert.deepEqual(state.document.bodies, before.bodies);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
}
