import assert from "node:assert/strict";
import { drag, reset } from "./ui-helpers.mjs";
import {
  assertNavigation,
  navigationHistory,
  navigationIdle,
  navigationTips,
} from "./ui-navigation-history.mjs";
import { pinchStep } from "./ui-navigation-inputs.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function animatedHistory(page, redo = false) {
  await page.evaluate(() => {
    window.navigationAnimationFrames = new Promise((resolve, reject) => {
      const frames = [];
      const deadline = performance.now() + 5000;
      let moving = false;
      const sample = () => {
        const camera = window.makeshiftInspect().camera;
        if (camera.moving) {
          moving = true;
          frames.push(camera);
        } else if (moving) {
          resolve(frames);
          return;
        }
        if (performance.now() > deadline) {
          reject(new Error("History camera change did not animate"));
          return;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  });
  const restored = await navigationHistory(page, redo);
  const frames = await page.evaluate(() => window.navigationAnimationFrames);
  assert.ok(frames.length > 1, "History restoration has multiple visible animation frames");
  assert.notDeepEqual(frames[0].target, restored.camera.target, "Camera travels toward the target");
  return restored;
}

async function trailingViews(page) {
  await reset(page);
  const before = await navigationIdle(page);
  await pinchStep(page, 30, 20);
  const middle = await navigationIdle(page);
  await pinchStep(page, 45, 25);
  const after = await navigationIdle(page);
  assert.equal((await navigationTips(page)).length, 2);
  assertNavigation(await animatedHistory(page), middle);
  assertNavigation(await animatedHistory(page), before);
  assertNavigation(await animatedHistory(page, true), middle);
  assertNavigation(await animatedHistory(page, true), after);
  assert.equal((await navigationTips(page)).length, 2, "Animations add no history entries");
  await page.getByRole("button", { name: "More tools", exact: true }).focus();
  await page.keyboard.press("Meta+z");
  await page.waitForFunction(() => window.makeshiftInspect().camera.moving);
  await page.keyboard.press("Meta+z");
  assertNavigation(
    await navigationIdle(page),
    before,
    "Repeated Undo interrupts earlier animation",
  );
  assertNavigation(await navigationHistory(page, true), middle);
  assertNavigation(await navigationHistory(page, true), after);
  await navigationHistory(page);
  const oldIds = (await navigationTips(page)).map((entry) => entry.id);
  await pinchStep(page, -25, -15);
  await navigationIdle(page);
  const replacement = await navigationTips(page);
  assert.equal(replacement.length, 1);
  assert.ok(replacement.every((entry) => !oldIds.includes(entry.id)));
  assertNavigation(await animatedHistory(page), middle, "New gesture branches from visible view");
}

async function editBoundary(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-15, -10], [15, 10]);
  const first = await navigationIdle(page);
  await pinchStep(page, 25, 15);
  await navigationIdle(page);
  await pinchStep(page, 30, 20);
  await navigationIdle(page);
  assert.equal((await navigationTips(page)).length, 2);
  await page.keyboard.press("r");
  await drag(page, [30, -10], [45, 10]);
  const second = await navigationIdle(page);
  assert.equal(second.document.sketches[0].curves.length, 8);
  assert.equal((await navigationTips(page)).length, 0, "Edit expires every view state");
  const undone = await navigationHistory(page);
  assert.deepEqual(undone.document, first.document);
  const older = await navigationHistory(page);
  assert.equal(older.document.sketches.flatMap((sketch) => sketch.curves).length, 0);
  assert.equal((await navigationTips(page)).length, 0, "Next Undo is an edit, never an old view");
  await navigationHistory(page, true);
  await navigationHistory(page, true);
  assert.deepEqual((await navigationIdle(page)).document, second.document);
}

export async function navigationTailRoute(page, name) {
  await trailingViews(page);
  await editBoundary(page);
  console.log(
    `${name}: full view suffix, partial-Undo branch, animated Undo/Redo and edit expiration passed`,
  );
}
