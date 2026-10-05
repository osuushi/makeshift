import assert from "node:assert/strict";
import { chooseTool } from "./ui-tools.mjs";

export async function navigationIdle(page) {
  await page.waitForFunction(() => {
    const s = window.makeshiftInspect();
    return (
      !s.busy &&
      !s.camera.moving &&
      !s.camera.navigationPending &&
      document.querySelector(".orientation-cube")?.getAttribute("aria-busy") !== "true" &&
      !s.commands.some((command) => command.unavailable === "Switching tools…")
    );
  });
  return page.evaluate(() => window.makeshiftInspect());
}
export async function navigationHistory(page, redo = false) {
  await chooseTool(page, redo ? "redo" : "undo", redo ? "redo" : "undo");
  return navigationIdle(page);
}
export function assertNavigation(actual, expected, label = "Restored view") {
  for (const key of ["position", "target", "up"]) {
    actual.camera[key].forEach((n, i) => {
      assert.ok(Math.abs(n - expected.camera[key][i]) < 1e-7, `${label}: ${key}[${i}]`);
    });
  }
  assert.ok(Math.abs(actual.camera.height - expected.camera.height) < 1e-7, `${label}: height`);
  assert.equal(actual.activePlane, expected.activePlane, `${label}: workspace`);
  assert.equal(actual.activeSketch, expected.activeSketch, `${label}: sketch`);
  assert.deepEqual(
    actual.selectionTargets,
    expected.selectionTargets,
    `${label}: sketch selection`,
  );
  assert.deepEqual(
    actual.modelingSelection,
    expected.modelingSelection,
    `${label}: model selection`,
  );
}
export async function navigationTips(page) {
  return page.evaluate(async () =>
    (await window.makeshiftHistory()).filter(
      (entry) =>
        entry.operation.kind === "navigation" && ["applied", "undone"].includes(entry.state),
    ),
  );
}
export async function navigationRoundTrip(page, action, label) {
  const before = await navigationIdle(page);
  const history = await page.evaluate(() => window.makeshiftHistory());
  const previousTips = await navigationTips(page);
  await action();
  const after = await navigationIdle(page);
  const entries = await page.evaluate(() => window.makeshiftHistory());
  const added = entries.filter((entry) => entry.id > (history.at(-1)?.id ?? 0));
  assert.deepEqual(
    added.map((entry) => entry.operation.kind),
    ["navigation"],
    `${label}: one intent`,
  );
  const retained = previousTips.some((entry) => entry.state === "undone") ? 0 : previousTips.length;
  assert.equal((await navigationTips(page)).length, retained + 1, `${label}: trailing view suffix`);
  assert.deepEqual(after.document, before.document, `${label}: accepted geometry unchanged`);
  const undone = await navigationHistory(page);
  assertNavigation(undone, before, `${label}: Undo`);
  assert.deepEqual(undone.document, before.document);
  const redone = await navigationHistory(page, true);
  assertNavigation(redone, after, `${label}: Redo`);
  assert.deepEqual(redone.document, before.document);
  return { before, after };
}
