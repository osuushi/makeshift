import assert from "node:assert/strict";
import { drag, reset } from "./ui-helpers.mjs";
import {
  assertNavigation,
  navigationHistory,
  navigationIdle,
  navigationTips,
} from "./ui-navigation-history.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function tiltedView(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-15, -10], [15, 10]);
  const box = await page.locator("canvas").boundingBox();
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  const radius = Math.min(box.width, box.height) * 0.28;
  await page.mouse.move(x + radius, y);
  await page.keyboard.down("Meta");
  await page.keyboard.down("Alt");
  await page.mouse.down();
  for (let i = 1; i <= 4; i++) {
    const angle = (i * Math.PI) / 32;
    await page.mouse.move(x + radius * Math.cos(angle), y + radius * Math.sin(angle));
  }
  await page.keyboard.press("Escape"); // Keep the ordinary unsnapped tilted view.
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await page.keyboard.up("Meta");
  const tilted = await navigationIdle(page);
  assert.ok(
    tilted.camera.up.some((n) => Math.abs(n) > 0.1 && Math.abs(n) < 0.95),
    "Setup leaves a noncanonical horizon",
  );
  return tilted;
}
async function stableAfterCompletionDeadline(page, expected) {
  const history = await page.evaluate(() => window.makeshiftHistory());
  // Negative stability check across the existing 200ms idle + 280ms animation lifetimes.
  await page.waitForTimeout(600);
  const after = await navigationIdle(page);
  assertNavigation(after, expected, "No late completion after interruption");
  assert.deepEqual(after.document, expected.document);
  assert.deepEqual(
    await page.evaluate(() => window.makeshiftHistory()),
    history,
    "No late navigation intent",
  );
}
async function undoBeforeWheelIdle(page) {
  const before = await tiltedView(page);
  await page.getByLabel("Modeling viewport", { exact: true }).focus();
  await page.mouse.move(1000, 600);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -12);
  await page.keyboard.up("Control");
  await page.waitForFunction((height) => {
    const s = window.makeshiftInspect();
    return s.camera.height !== height && s.camera.navigationPending && !s.camera.moving;
  }, before.camera.height);
  const pinched = await page.evaluate(() => window.makeshiftInspect());
  assert.equal(
    pinched.camera.navigationPending,
    true,
    "Undo begins before the real wheel idle deadline",
  );
  await page.keyboard.press("Meta+z");
  const undone = await navigationIdle(page);
  assertNavigation(undone, before, "Before-idle wheel Undo restores tilted camera");
  assert.deepEqual(undone.document, before.document);
  await stableAfterCompletionDeadline(page, undone);
  const redone = await navigationHistory(page, true);
  assertNavigation(redone, pinched, "Redo restores the interrupted visible pinch pose");
  await stableAfterCompletionDeadline(page, redone);
}
async function selectionBeforeCanonicalFinish(page) {
  const before = await navigationIdle(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.getByLabel("Modeling viewport", { exact: true }).focus();
  assert.equal(
    await page.evaluate(() => window.makeshiftInspect().camera.moving),
    true,
    "Selection begins during canonical animation",
  );
  await page.keyboard.press("Meta+a"); // Actual Select-all sketch command.
  const selected = await navigationIdle(page);
  assert.equal(selected.selectedCurves.length, 4);
  assert.equal(selected.camera.moving, false);
  assert.deepEqual(selected.document, before.document);
  assert.equal(
    (await navigationTips(page)).length,
    0,
    "Independent selection expires the interrupted view",
  );
  await stableAfterCompletionDeadline(page, selected);
}
async function undoBeforeCanonicalFinish(page) {
  await chooseTool(page, "Return to Modeling", "modeling");
  const before = await navigationIdle(page);
  await chooseTool(page, "Sketch on YZ", "sketch-yz");
  await page.getByLabel("Modeling viewport", { exact: true }).focus();
  assert.equal(
    await page.evaluate(() => window.makeshiftInspect().camera.moving),
    true,
    "Undo begins during canonical animation",
  );
  await page.keyboard.press("Meta+z");
  const undone = await navigationIdle(page);
  assertNavigation(undone, before, "Canonical animation Undo restores prior full context");
  await stableAfterCompletionDeadline(page, undone);
  const redone = await navigationHistory(page, true);
  assert.equal(redone.activePlane, "YZ");
  assert.equal(redone.camera.moving, false);
  assert.deepEqual(redone.document, before.document);
  await stableAfterCompletionDeadline(page, redone);
}
export async function navigationInterruptionRoute(page, name) {
  await undoBeforeWheelIdle(page);
  await selectionBeforeCanonicalFinish(page);
  await undoBeforeCanonicalFinish(page);
  console.log(
    `${name}: actual Undo before wheel idle/canonical completion, selection interruption, stable restored view and Redo passed`,
  );
}
