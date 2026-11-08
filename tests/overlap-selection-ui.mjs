import assert from "node:assert/strict";
import { DocumentOwner } from "../.cache/sketch-tests/src/backend/document-owner.js";
import { prism } from "../.cache/sketch-tests/tests/body-edge-fixtures.js";
import { openDocument } from "./native-documents.mjs";
import { project } from "./ui-blend-edit.mjs";
import { inspect } from "./ui-helpers.mjs";
import { overlapCancellation } from "./ui-overlap-cancel.mjs";
import { overlapEdges } from "./ui-overlap-edges.mjs";
import { overlapFraming } from "./ui-overlap-framing.mjs";
import { hold, releaseChoice } from "./ui-overlap-gesture.mjs";
import { overlapRegions } from "./ui-overlap-regions.mjs";
import { planeSketchPreview } from "./ui-overlap-sketches.mjs";
import { overlapTouch } from "./ui-overlap-touch.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

const owner = new DocumentOwner();
let fixture;
try {
  await prism(owner, [
    [-30, -30],
    [30, -30],
    [30, 30],
    [-30, 30],
  ]);
  fixture = JSON.parse(JSON.stringify({ ...owner.view.data, sketches: [] }));
} finally {
  owner.close();
}
async function loadFixture(page) {
  await inspect(page);
  await openDocument(page, {
    name: "overlap.makeshift",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ format: "makeshift", version: 1, document: fixture })),
  });
  await inspect(page);
}
function assertChoiceOrder(rows) {
  const types = [...new Set(rows.map((r) => r.kind))];
  const groups = types.map((kind) => rows.filter((r) => r.kind === kind));
  assert.deepEqual(rows, groups.flat(), "Each type stays contiguous in the flat chooser");
  for (const group of groups)
    assert.deepEqual(
      group.map((r) => r.depth),
      group.map((r) => r.depth).sort((a, b) => a - b),
      "Choices within a type run nearest first",
    );
  const nearest = groups.map((g) => g[0].depth);
  assert.deepEqual(
    nearest,
    [...nearest].sort((a, b) => a - b),
    "Nearest type comes first",
  );
}
async function route(page, name) {
  await loadFixture(page);
  const original = (await inspect(page)).document;
  assert.equal(await page.locator(".plane-label, .construction-plane-labels").count(), 0);
  await page.mouse.move(30, 35);
  await page.screenshot({ path: `.cache/sketch-review/${name}-stronger-grid.png` });
  const point = await project(page, [0, 0, 10]);
  await page.mouse.click(point.x, point.y);
  let state = await inspect(page);
  assert.deepEqual(state.planeTargets.find((p) => p.id === "XY").bounds, {
    minX: -42,
    maxX: 42,
    minY: -42,
    maxY: 42,
  });
  assert.equal(state.activePlane, null);
  assert.equal(state.modelingSelection[0]?.kind, "face", "Body geometry wins ordinary clicks");
  await overlapCancellation(page, point, hold);
  await overlapEdges(page, hold);
  await hold(page, point);
  const panel = page.getByRole("dialog", { name: "Choose overlapping geometry" });
  await panel.waitFor({ state: "visible" });
  const items = panel.locator(".selection-overlap-items button");
  const rows = await items.evaluateAll((items) =>
    items.map((b) => ({
      kind: b.dataset.kind,
      key: b.dataset.key,
      depth: Number(b.dataset.depth),
    })),
  );
  assert.equal(rows.filter((r) => r.kind === "face").length, 1, "Back face not listed");
  assert.ok(rows.some((r) => r.kind === "body"));
  assert.ok(rows.some((r) => r.kind === "plane"));
  assertChoiceOrder(rows);
  assert.equal(await items.locator("svg path").count(), rows.length * 4);
  const plane = items.filter({ hasText: "Plane · XY" });
  await plane.hover();
  assert.equal(await panel.getAttribute("data-highlight"), "XY");
  await page.screenshot({ path: `.cache/sketch-review/${name}-overlap-plane.png` });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.equal(await panel.isVisible(), false);
  assert.deepEqual((await inspect(page)).document, original);
  await hold(page, point);
  await releaseChoice(page, "Body");
  state = await inspect(page);
  assert.equal(state.modelingSelection[0].kind, "body");
  const hover = await project(page, [15, 10, 10]);
  await page.mouse.move(hover.x, hover.y);
  assert.equal((await inspect(page)).modelingHover, "face", "Hover resumes after release");
  await page.keyboard.press("m");
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  await page.locator(".body-transform-value").fill("3");
  await page.keyboard.press("Enter");
  assert.ok(Math.abs((await inspect(page)).document.bodies[0].center[0] - 3) < 1e-6);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await page.keyboard.press("Escape");

  await hold(page, await project(page, [-15, -15, 10]));
  await releaseChoice(page, "Plane · XY");
  assert.equal((await inspect(page)).activePlane, null, "Chooser selects a canonical reference");
  assert.equal((await inspect(page)).planeTargets.find((p) => p.id === "XY").selected, true);
  await page.keyboard.press("Enter");
  assert.equal((await inspect(page)).activePlane, "XY");
  await navigationCancellation(page, panel);
  await adaptiveMargin(page);
  console.log(
    `${name}: ordinary precedence, long hold, thumbnails, hover, body/plane choice and cancellation passed`,
  );
}
async function navigationCancellation(page, panel) {
  await chooseTool(page, "return to modeling", "modeling");
  await inspect(page);
  const p = await project(page, [0, 0, 10]);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 35, p.y + 35, { steps: 5 });
  await page.waitForTimeout(700);
  await page.mouse.up();
  assert.equal(await panel.isVisible(), false, "Movement remains a normal drag");
  await hold(page, p);
  await page.mouse.wheel(0, 30);
  await page.mouse.up();
  assert.equal(await panel.isVisible(), false, "Navigation dismisses chooser");
}
async function adaptiveMargin(page) {
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await chooseTool(page, "return to modeling", "modeling");
  const margin = await project(page, [38, 4, 0]);
  await page.mouse.click(margin.x, margin.y);
  await page.keyboard.press("Enter");
  assert.equal(
    (await inspect(page)).activePlane,
    "XY",
    "Adaptive margin remains clickable outside a body larger than the old patch",
  );
  await chooseTool(page, "return to modeling", "modeling");
}
await withUiRuntimes(
  async (page, name) => {
    await route(page, name);
    if (name !== "electron") {
      const touch = await page
        .context()
        .browser()
        .newPage({
          viewport: { width: 1280, height: 900 },
          hasTouch: true,
        });
      try {
        await touch.addInitScript(() => {
          window.makeshiftRemote = true;
        });
        await touch.goto(page.url());
        await loadFixture(touch);
        await overlapTouch(touch, name);
      } finally {
        await touch.close();
      }
    }
    await planeSketchPreview(page, name);
    await overlapFraming(page, name);
    await overlapRegions(page, name);
  },
  { viewport: { width: 1280, height: 900 } },
);
