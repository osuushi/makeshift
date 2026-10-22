import assert from "node:assert/strict";
import { guidePosition } from "../.cache/sketch-tests/src/guides/evaluate.js";
import { project } from "./ui-blend-edit.mjs";
import { inspect, modalCompleted } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Captured drag routing, a still-hold timer and thumbnail hit testing need an actual renderer.
export async function guideDisambiguation(page, name, sourceId) {
  const before = (await inspect(page)).document;
  const guide = before.guidePoints.find((g) => g.name === "Source anchor");
  const a = await project(page, [20, 20, 10]),
    b = await project(page, [45, 0, 18]);
  const ownMidpoint = await project(page, [20, 10, 10]);
  await dragTo(page, a, ownMidpoint);
  const vector = page.locator(".guide-move-vector");
  assert.deepEqual(JSON.parse(await vector.getAttribute("data-end")), [20, 10, 10]);
  await page.mouse.up();
  await modalCompleted(page);
  let state = await inspect(page);
  assert.deepEqual(guidePosition(state.document, guide.anchor), [20, 10, 10]);
  assert.ok(Math.abs(state.document.bodies.find((b) => b.id === sourceId).center[1]) < 1e-6);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);

  const panel = page.getByRole("dialog", { name: "Choose snap target" });
  await dragTo(page, a, b);
  // Moving away resets the dwell; small drift at the target does not.
  await page.waitForTimeout(100);
  await page.mouse.move(b.x + 35, b.y - 35);
  await page.waitForTimeout(100);
  assert.equal(await panel.isVisible(), false);
  await page.mouse.move(b.x, b.y);
  await page.waitForTimeout(160);
  await page.mouse.move(b.x + 1, b.y + 1);
  await panel.waitFor({ state: "visible" });
  assert.equal((await inspect(page)).interaction.kind, "guide-move");
  assert.deepEqual((await inspect(page)).document, before);
  const buttons = panel.locator(".selection-overlap-items button");
  assert.ok((await buttons.count()) >= 2);
  assert.equal(await buttons.locator("svg .overlap-point").count(), await buttons.count());
  const target = panel.locator('button[data-point="[45,0,8]"]');
  assert.equal(
    await target.count(),
    1,
    "covered point on the target body's bottom remains selectable",
  );
  const box = await target.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  assert.deepEqual(JSON.parse(await vector.getAttribute("data-end")), [45, 0, 8]);
  assert.deepEqual(JSON.parse(await vector.getAttribute("data-start")), [20, 20, 10]);
  await page.screenshot({ path: `.cache/sketch-review/${name}-guide-disambiguation.png` });
  await page.mouse.up();
  await modalCompleted(page);
  state = await inspect(page);
  assert.deepEqual(guidePosition(state.document, guide.anchor), [45, 0, 8]);
  assert.equal(await panel.isVisible(), false);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await cancelChoices(page, a, b, before);
  await defaultAndResume(page, a, b, before);
  console.log(
    `${name}: same-body unsaved midpoint, dwell disambiguation, marked diagrams, covered target, release/Undo and chooser cancellation passed`,
  );
}
async function dragTo(page, a, b) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
}
async function cancelChoices(page, a, b, before) {
  const panel = page.getByRole("dialog", { name: "Choose snap target" });
  await dragTo(page, a, b);
  await panel.waitFor({ state: "visible" });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await modalCompleted(page);
  assert.equal(await panel.isVisible(), false);
  assert.deepEqual((await inspect(page)).document, before);
  await dragTo(page, a, b);
  await panel.waitFor({ state: "visible" });
  await page.mouse.move(1, 1);
  assert.equal(
    await page.evaluate(() => !!document.elementFromPoint(1, 1)?.closest(".guide-move-choices")),
    false,
  );
  await page.mouse.up();
  await modalCompleted(page);
  assert.equal(await panel.isVisible(), false);
  assert.notDeepEqual(
    (await inspect(page)).document,
    before,
    "release outside retains the selected snap",
  );
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
}

async function defaultAndResume(page, a, b, before) {
  const panel = page.getByRole("dialog", { name: "Choose snap target" });
  const vector = page.locator(".guide-move-vector");
  await dragTo(page, a, b);
  const snapped = await vector.getAttribute("data-end");
  await panel.waitFor({ state: "visible" });
  assert.equal(await vector.getAttribute("data-end"), snapped);
  assert.equal(await panel.locator('button[aria-pressed="true"]').count(), 1);
  await page.mouse.up();
  await modalCompleted(page);
  assert.notDeepEqual((await inspect(page)).document, before);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);

  await dragTo(page, a, b);
  await panel.waitFor({ state: "visible" });
  await page.mouse.move(1, 1);
  await page.waitForTimeout(250);
  await page.mouse.move(b.x, b.y);
  await page.waitForTimeout(400);
  assert.equal(await panel.isVisible(), true, "returning to the point resets dismissal");
  await page.keyboard.down("Shift");
  await page.mouse.move(1, 1);
  await page.waitForTimeout(550);
  assert.match(await panel.getAttribute("class"), /fading/);
  await panel.waitFor({ state: "hidden" });
  assert.equal((await inspect(page)).interaction.kind, "guide-move");
  assert.match(await vector.getAttribute("class"), /unsnapped/);
  assert.equal(await vector.locator("line").getAttribute("x2"), "1");
  assert.equal(await vector.locator("line").getAttribute("y2"), "1");
  assert.equal(await vector.locator("marker").getAttribute("markerWidth"), "12");
  await page.screenshot({ path: ".cache/sketch-review/guide-unsnapped-cursor.png" });
  await page.keyboard.up("Shift");
  await page.mouse.move(b.x, b.y);
  assert.equal(await vector.getAttribute("data-end"), snapped);
  await page.mouse.up();
  await modalCompleted(page);
  assert.notDeepEqual((await inspect(page)).document, before);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
}
