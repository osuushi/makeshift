import assert from "node:assert/strict";
import { guidePosition } from "../.cache/sketch-tests/src/guides/evaluate.js";
import { project } from "./ui-blend-edit.mjs";
import { inspect, modalCompleted } from "./ui-helpers.mjs";
import { orientWithTurntable } from "./ui-orbit-orient.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function planeDestinationRoute(page, before, source, guide) {
  const vector = page.locator(".guide-move-vector");
  // A face has no drag hit area; only its normal destination acquires the snap.
  await orientWithTurntable(page, [0.2, -0.6, 1]);
  const sourcePoint = await project(page, [20, 20, 10]);
  const surface = await project(page, [52, 8, 18]);
  const destination = await project(page, [20, 20, 18]);
  await page.mouse.move(sourcePoint.x, sourcePoint.y);
  await page.mouse.down();
  await page.mouse.move(surface.x, surface.y, { steps: 5 });
  assert.equal(await vector.getAttribute("data-end"), "");
  const destinations = page.locator(".guide-move-destinations");
  assert.ok(
    (await destinations.locator("circle[data-projection]:visible").count()) <= 3,
    "automatic destination feedback shows at most three locations",
  );
  assert.equal(
    await destinations.locator(".guide-face-plane-patch").count(),
    0,
    "face grids need a locked endpoint",
  );
  assert.deepEqual(
    await destinations
      .locator(".guide-plane-patch")
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.plane)),
    ["XY", "XZ", "YZ"],
  );
  assert.equal(
    await destinations.locator('.guide-plane-patch stop[offset="1"][stop-opacity="0"]').count(),
    3,
  );
  assert.ok((await destinations.locator('.guide-plane-patch[data-plane="XZ"] line').count()) > 0);
  const dot = destinations.locator('circle[data-point="[20,20,18]"]');
  assert.equal(await dot.count(), 1);
  assert.equal(await dot.getAttribute("r"), "4");
  assert.equal(await destinations.locator("path").count(), 0, "destination dots have no crosses");
  const line = destinations.locator('line[data-point="[20,20,18]"]');
  assert.equal(await line.count(), 1);
  assert.ok(Math.abs(Number(await line.getAttribute("x1")) - sourcePoint.x) < 0.1);
  assert.ok(Math.abs(Number(await line.getAttribute("y2")) - destination.y) < 0.1);
  assert.equal(await line.evaluate((el) => getComputedStyle(el).strokeDasharray), "2px, 4px");
  await page.screenshot({ path: ".cache/sketch-review/guide-drag-destinations.png" });
  const canonical = await project(page, [20, 20, 0]);
  await page.mouse.move(canonical.x, canonical.y, { steps: 5 });
  const patch = destinations.locator('.guide-plane-patch[data-plane="XY"]');
  assert.match(await patch.getAttribute("class"), /highlighted/);
  assert.equal(await patch.evaluate((el) => getComputedStyle(el).color), "rgb(139, 92, 246)");
  await page.screenshot({ path: ".cache/sketch-review/guide-plane-parent-highlight.png" });
  await page.mouse.move(surface.x, surface.y, { steps: 5 });
  assert.equal(await destinations.locator(".guide-plane-patch.highlighted").count(), 0);
  assert.equal(await destinations.locator(".guide-face-plane-patch").count(), 0);
  await page.mouse.move(destination.x, destination.y, { steps: 5 });
  assert.equal(await vector.getAttribute("data-target"), "Face plane");
  assert.deepEqual(JSON.parse(await vector.getAttribute("data-end")), [20, 20, 18]);
  assert.deepEqual(JSON.parse(await vector.getAttribute("data-start")), [20, 20, 10]);
  await checkCoplanarityStroke(page, destinations, destination);
  await page.screenshot({ path: ".cache/sketch-review/guide-face-parent-highlight.png" });
  await page.mouse.up();
  await modalCompleted(page);
  assert.equal(await destinations.locator(".guide-plane-patch").count(), 0);
  const state = await inspect(page);
  assert.deepEqual(guidePosition(state.document, guide.anchor), [20, 20, 18]);
  assert.equal(state.document.bodies.find((body) => body.id === source.id).volume, source.volume);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
}

async function checkCoplanarityStroke(page, destinations, destination) {
  const bridge = destinations.locator('.guide-face-plane-patch[data-destination="[20,20,18]"]');
  assert.equal(await bridge.count(), 1);
  assert.deepEqual(JSON.parse(await bridge.getAttribute("data-source")), [45, 20, 18]);
  const initial = await bridge.elementHandle();
  await page.mouse.move(destination.x + 1, destination.y + 1);
  assert.equal(
    await initial.evaluate((el) => el.isConnected),
    true,
    "stable lock keeps the same stroke",
  );
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".guide-face-plane-patch .guide-grid-reveal")].every(
      (el) => Number.parseFloat(getComputedStyle(el).strokeDashoffset) === 0,
    ),
  );
  assert.equal(await bridge.locator("feGaussianBlur").count(), 1);
  await page.screenshot({ path: ".cache/sketch-review/guide-face-coplanarity-grid.png" });
  await page.keyboard.down("Shift");
  await page.mouse.move(destination.x, destination.y);
  assert.equal(await bridge.count(), 0, "Shift clears the face grid");
  await page.keyboard.up("Shift");
  await page.mouse.move(destination.x, destination.y);
}
