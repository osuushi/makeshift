import assert from "node:assert/strict";
import { at, drag, inspect, modalCompleted } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Focused acceptance of candidate hit targets, overlap choice, row controls and camera-projected
// drawing. These DOM/pointer boundaries are not exercised by semantic geometry tests.
await withUiRuntimes(async (page, name) => {
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [4, 7], [24, 27]);
  const original = (await inspect(page)).document;
  await chooseTool(page, "Guide points", "guide-points");
  assert.equal((await inspect(page)).interaction.kind, "guide-points");
  const corner = await at(page, 24, 27);
  await page.mouse.click(corner.x, corner.y);
  const chooser = page.locator(".guide-choices");
  await chooser.waitFor({ state: "visible" });
  await chooser
    .getByRole("button", { name: "Sketch curve end endpoint", exact: true })
    .first()
    .click();
  await page.waitForFunction(() => window.makeshiftInspect().document.guidePoints?.length === 1);
  await page.locator(".guide-tool").getByRole("button", { name: "Done" }).click();
  await modalCompleted(page);
  let state = await inspect(page);
  assert.deepEqual(state.document.sketches, original.sketches);
  const row = page
    .locator(".entity-viewer")
    .getByRole("button", { name: "Select Guide point 1", exact: true });
  await row.dblclick();
  const field = page.getByRole("textbox", { name: "Guide point name" });
  await field.fill("Corner anchor");
  await field.press("Enter");
  const savedRow = page
    .locator(".entity-viewer")
    .getByRole("button", { name: "Select Corner anchor", exact: true });
  assert.match(await savedRow.getAttribute("title"), /Sketch curve end endpoint/);
  const compactRow = savedRow.locator("..");
  assert.equal(await compactRow.getByRole("button").count(), 2);
  const labelBox = await savedRow.boundingBox();
  const eyeBox = await page.getByRole("button", { name: "Hide Corner anchor" }).boundingBox();
  assert.ok(Math.abs(labelBox.y + labelBox.height / 2 - eyeBox.y - eyeBox.height / 2) < 1);
  assert.equal(await compactRow.locator("svg").count(), 1);
  await page.getByRole("button", { name: "Hide Corner anchor" }).click();
  assert.equal((await inspect(page)).document.guidePoints[0].hidden, true);
  assert.equal(await page.locator(".guide-marker.saved").count(), 0);
  await page.getByRole("button", { name: "Show Corner anchor" }).click();
  await chooseTool(page, "Sketch on XZ", "sketch-xz");
  await page.waitForFunction(() => !window.makeshiftInspect().camera.moving);
  if ((await inspect(page)).gridSnap) await chooseTool(page, "Grid snapping", "grid");
  await page.keyboard.press("c");
  await drag(page, [24.13, 0.09], [27, 0]);
  state = await inspect(page);
  const circle = state.document.sketches.flatMap((s) => s.curves).find((c) => c.kind === "circle");
  assert.ok(circle);
  assert.ok(Math.hypot(circle.center.x - 24, circle.center.y) < 1e-6, JSON.stringify(circle));
  await page.screenshot({ path: `.cache/sketch-review/${name}-guide-points.png` });
  const beforeRemove = (await inspect(page)).document.sketches;
  await savedRow.click();
  await page.keyboard.press("Delete");
  assert.equal((await inspect(page)).document.guidePoints.length, 0);
  assert.deepEqual((await inspect(page)).document.sketches, beforeRemove);
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.guidePoints[0].name, "Corner anchor");
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("v");
  const midpoint = await at(page, 14, 27);
  await page.mouse.move(midpoint.x, midpoint.y);
  await page.locator(".guide-marker.ghost").first().waitFor({ state: "visible" });
  const beforeHoverClick = (await inspect(page)).selectionTargets;
  await page.mouse.click(midpoint.x, midpoint.y);
  assert.deepEqual((await inspect(page)).selectionTargets, beforeHoverClick);
  assert.equal((await inspect(page)).document.guidePoints.length, 1);
  await page.mouse.dblclick(midpoint.x, midpoint.y);
  await page.waitForFunction(() => window.makeshiftInspect().document.guidePoints?.length === 2);
  assert.equal((await inspect(page)).document.guidePoints[1].anchor.feature, "midpoint");
  assert.deepEqual((await inspect(page)).selectionTargets, beforeHoverClick);
  await dragWholeSketch(page);
  console.log(
    `${name}: compact guide rows, tooltip, Delete, visibility, projected circle and hover click precedence passed`,
  );
});

async function dragWholeSketch(page) {
  const before = (await inspect(page)).document;
  const saved = before.guidePoints.find((g) => g.anchor.feature === "midpoint");
  const sketch = before.sketches.find((s) => s.id === saved.anchor.sketch);
  const from = await at(page, 14, 27),
    to = await at(page, 0, 0);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  assert.equal((await inspect(page)).interaction.kind, "guide-move");
  assert.deepEqual((await inspect(page)).document, before);
  assert.equal(await page.locator(".guide-move-vector").getAttribute("data-target"), "Origin");
  await page.mouse.up();
  await modalCompleted(page);
  const moved = (await inspect(page)).document;
  const result = moved.sketches.find((s) => s.id === sketch.id);
  assert.ok(Math.hypot(...result.plane.origin.map((v, i) => v - [-14, -27, 0][i])) < 1e-7);
  assert.deepEqual(result.curves, sketch.curves);
  assert.deepEqual(result.constraints, sketch.constraints);
  assert.deepEqual(
    moved.sketches.filter((s) => s.id !== sketch.id),
    before.sketches.filter((s) => s.id !== sketch.id),
  );
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
}
