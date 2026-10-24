import assert from "node:assert/strict";
import { documentArchive } from "../.cache/sketch-tests/src/model/document-archive.js";
import { emptySketch } from "../.cache/sketch-tests/src/sketch/document.js";
import { planes } from "../.cache/sketch-tests/src/sketch/planes.js";
import { openDocument } from "./native-documents.mjs";
import { project } from "./ui-blend-edit.mjs";
import { inspect, modalCompleted } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Marker and row modifier routing plus tool availability must be verified in the renderer.
await withUiRuntimes(async (page, name) => {
  const points = [
    [0, 0, 0],
    [30, 0, 0],
    [0, 30, 0],
  ];
  const sketch = {
    ...emptySketch(planes.XY),
    curves: points.map(([x, y], i) => ({
      id: `c${i}`,
      kind: "circle",
      center: { x, y },
      radius: 5,
      construction: false,
    })),
  };
  await openDocument(page, {
    name: "guide-selection.makeshift",
    mimeType: "application/json",
    buffer: Buffer.from(
      documentArchive(
        { units: "mm", sketches: [sketch] },
        { position: [10, 10, 100], target: [10, 10, 0], up: [0, 1, 0], height: 80 },
      ),
    ),
  });
  const planeTool = page.locator('.toolbox [data-tool="construction-plane"]');
  for (const [i, point] of points.entries()) {
    const screen = await project(page, point);
    await page.mouse.move(screen.x, screen.y);
    if (i) await page.keyboard.down("Shift");
    await page.mouse.click(screen.x, screen.y);
    if (i) await page.keyboard.up("Shift");
    await page.waitForFunction(
      (count) => window.makeshiftInspect().document.guidePoints?.length === count,
      i + 1,
    );
    assert.equal(await page.locator('.guide-marker.saved[aria-pressed="true"]').count(), i + 1);
    assert.equal(await planeTool.isEnabled(), i === 2);
  }
  const before = (await inspect(page)).document;
  await page.screenshot({ path: `.cache/sketch-review/${name}-guide-multiselect-plane.png` });
  await planeTool.click();
  await modalCompleted(page);
  let state = await inspect(page);
  assert.equal(state.document.constructionPlanes.length, 1);
  assert.deepEqual(state.document.constructionPlanes[0].frame, planes.XY);
  assert.deepEqual(state.document.guidePoints, before.guidePoints);
  assert.equal(await page.locator('.guide-marker.saved[aria-pressed="true"]').count(), 0);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  for (const [i, guide] of before.guidePoints.entries()) {
    const row = page
      .locator(".entity-viewer")
      .getByRole("button", { name: `Select ${guide.name}`, exact: true });
    await row.click({ modifiers: i ? ["Shift"] : [] });
    assert.equal(await row.getAttribute("aria-pressed"), "true");
  }
  const first = page
    .locator(".entity-viewer")
    .getByRole("button", { name: "Select Guide point 1", exact: true });
  await first.click({ modifiers: ["Shift"] });
  assert.equal(await first.getAttribute("aria-pressed"), "false");
  await first.click({ modifiers: ["Shift"] });
  await page.keyboard.press("Delete");
  await page.waitForFunction(() => window.makeshiftInspect().document.guidePoints.length === 0);
  assert.deepEqual((await inspect(page)).document.sketches, before.sketches);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual(
    (await inspect(page)).document,
    before,
    "one Undo restores the entire deleted selection",
  );
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  for (const [i, guide] of before.guidePoints.entries())
    await page
      .locator(".entity-viewer")
      .getByRole("button", { name: `Select ${guide.name}`, exact: true })
      .click({ modifiers: i ? ["Shift"] : [] });
  await planeTool.click();
  await modalCompleted(page);
  state = await inspect(page);
  assert.equal(state.activePlane, null, "creating from sketch guides returns to Modeling");
  assert.deepEqual(state.document.constructionPlanes[0].frame, planes.XY);
  console.log(
    `${name}: single-click creation, Shift multiselect/toggle, three-point plane and grouped Delete/Undo passed`,
  );
});
