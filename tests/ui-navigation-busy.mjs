import assert from "node:assert/strict";
import { holdAcceptanceReply } from "./native-model-reply.mjs";
import { at, drag, reset } from "./ui-helpers.mjs";
import {
  assertNavigation,
  navigationHistory,
  navigationIdle,
  navigationTips,
} from "./ui-navigation-history.mjs";
import { wheel } from "./ui-navigation-inputs.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function temporaryExtrusion(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-15, -10], [15, 10]);
  const profile = await at(page, 5, 3);
  await chooseTool(page, "Return to Modeling", "modeling");
  await page.mouse.click(profile.x, profile.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).fill("5");
  await page.keyboard.press("Enter");
  return navigationIdle(page);
}
export async function navigationModalPriority(page, name) {
  const initial = await temporaryExtrusion(page);
  const distance = page.getByRole("textbox", { name: "Extrusion distance", exact: true });
  await distance.fill("7");
  await page.getByRole("button", { name: "Tools", exact: true }).focus();
  await navigationIdle(page);
  await wheel(page, 30, 20);
  const panned = await navigationIdle(page);
  const tips = await navigationTips(page);
  assert.equal(tips.length, 1);
  const undo = await navigationHistory(page);
  assert.equal(
    undo.interaction.kind,
    "extrude",
    "Local checkpoint takes precedence over view Undo",
  );
  assert.ok(Math.abs(undo.preview.bodies[0].volume - initial.preview.bodies[0].volume) < 1e-6);
  assertNavigation(undo, panned, "Local Undo retains view");
  assert.deepEqual(await navigationTips(page), tips);
  await navigationHistory(page, true);
  await page.keyboard.press("Escape");
  assert.deepEqual((await navigationIdle(page)).document, initial.document);
  console.log(`${name}: modal parameter Undo/Redo retains priority over the ephemeral view tip`);
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
    assert.equal((await navigationTips(page)).length, 1);
    assert.deepEqual(final.document, rebased.document);
    const restored = await navigationHistory(page);
    assertNavigation(restored, rebased, "Held gesture rebased at accepted context");
    assert.deepEqual(restored.document, rebased.document, "View Undo retains accepted extrusion");
    assert.equal(
      (await navigationHistory(page)).document.bodies?.length ?? 0,
      0,
      "Next Undo reaches accepted extrusion",
    );
    console.log(
      `${name}: real acceptance publication retains pan capture and rebases its remaining view gesture`,
    );
  } finally {
    await page.mouse.up({ button: "right" });
    await hold.restore();
    await page.evaluate(() => {
      delete window.navigationAcceptanceReady;
    });
  }
}
