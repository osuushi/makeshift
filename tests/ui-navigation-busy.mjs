import assert from "node:assert/strict";
import { holdAcceptanceReply } from "./native-model-reply.mjs";
import { at, drag, reset } from "./ui-helpers.mjs";
import {
  assertNavigation,
  navigationHistory,
  navigationIdle,
  navigationTips,
} from "./ui-navigation-history.mjs";
import { cubeDrag } from "./ui-navigation-inputs.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function temporaryExtrusion(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-15, -10], [15, 10]);
  const profile = await at(page, 5, 3);
  await chooseTool(page, "Return to Modeling", "modeling");
  await page.mouse.click(profile.x, profile.y);
  await cubeDrag(page);
  await navigationIdle(page);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).fill("5");
  await page.keyboard.press("Enter");
  return navigationIdle(page);
}
export async function navigationModalPriority(page, name) {
  const initial = await temporaryExtrusion(page);
  const distance = page.getByRole("textbox", { name: "Extrusion distance", exact: true });
  await page.getByRole("button", { name: "Top view", exact: true }).click();
  const top = await navigationIdle(page);
  assert.equal((await navigationTips(page)).length, 1);
  const undo = await navigationHistory(page);
  assert.equal(undo.interaction.kind, "extrude");
  assert.deepEqual(undo.preview, initial.preview, "View Undo retains temporary extrusion");
  assertNavigation(undo, initial, "Modal view Undo");
  const redo = await navigationHistory(page, true);
  assert.equal(redo.interaction.kind, "extrude");
  assert.deepEqual(redo.preview, initial.preview);
  assertNavigation(redo, top, "Modal view Redo");
  await distance.fill("7");
  await page.getByRole("button", { name: "More tools", exact: true }).focus();
  await navigationIdle(page);
  const parameterUndo = await navigationHistory(page);
  assert.equal((await navigationTips(page)).length, 0, "Parameter edit expires earlier view tail");
  assert.equal(parameterUndo.interaction.kind, "extrude");
  assert.ok(
    Math.abs(parameterUndo.preview.bodies[0].volume - initial.preview.bodies[0].volume) < 1e-6,
  );
  assertNavigation(parameterUndo, top, "Parameter Undo retains current view");
  await navigationHistory(page, true);
  await page.keyboard.press("Escape");
  assert.deepEqual((await navigationIdle(page)).document, initial.document);
  const next = await temporaryExtrusion(page);
  await page.getByRole("button", { name: "Top view", exact: true }).click();
  await navigationIdle(page);
  await navigationHistory(page);
  await page.getByLabel("Modeling viewport", { exact: true }).focus();
  await page.keyboard.press("Enter");
  const accepted = await navigationIdle(page);
  assert.equal(accepted.interaction, null);
  assert.equal(accepted.document.bodies[0].volume, next.preview.bodies[0].volume);
  const history = await page.evaluate(() => window.makeshiftHistory());
  assert.equal(history.at(-1).operation.kind, "extrude", "View Undo preserves pending operation");
  assert.equal((await navigationHistory(page)).document.bodies?.length ?? 0, 0);
  console.log(
    `${name}: modal view Undo/Redo preserves extrusion; later parameter edit expires view tail`,
  );
}
export async function navigationDuringAcceptance(page, name) {
  await temporaryExtrusion(page);
  // Delay only delivery of a real backend acceptance reply, never geometry calculation.
  // This bounds the publication race without relying on kernel speed on the runner.
  const hold = await holdAcceptanceReply(page);
  try {
    await page.getByLabel("Modeling viewport", { exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      () => window.navigationAcceptanceReady && window.makeshiftInspect().busy,
    );
    const before = await page.evaluate(() => window.makeshiftInspect());
    await page.mouse.move(1000, 600);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(965, 580, { steps: 5 });
    await page.waitForFunction(
      (target) => window.makeshiftInspect().camera.target.some((v, i) => v !== target[i]),
      before.camera.target,
    );
    assert.equal(
      await page.evaluate(() => window.makeshiftInspect().busy),
      true,
      "View pans while acceptance is in flight",
    );
    await hold.release();
    await page.waitForFunction(
      () =>
        !window.makeshiftInspect().busy && window.makeshiftInspect().document.bodies?.length === 1,
    );
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const rebased = await page.evaluate(() => window.makeshiftInspect());
    await page.mouse.move(920, 550, { steps: 5 });
    await page.mouse.up({ button: "right" });
    const final = await navigationIdle(page);
    assert.equal((await navigationTips(page)).length, 0);
    assert.deepEqual(final.document, rebased.document);
    assert.notDeepEqual(
      final.camera.target,
      rebased.camera.target,
      "Pan continues through acceptance",
    );
    const restored = await navigationHistory(page);
    assert.equal(
      restored.document.bodies?.length ?? 0,
      0,
      "Undo reaches accepted extrusion directly",
    );
    console.log(
      `${name}: real acceptance publication retains ordinary pan capture without recording view history`,
    );
  } finally {
    await page.mouse.up({ button: "right" });
    await hold.restore();
    await page.evaluate(() => {
      delete window.navigationAcceptanceReady;
    });
  }
}
