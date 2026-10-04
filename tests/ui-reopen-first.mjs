import assert from "node:assert/strict";
import { plate } from "./ui-body-fillet.mjs";
import { at, close, drag, inspect, reset } from "./ui-helpers.mjs";
import { completed } from "./ui-reopen-state.mjs";
import { chooseTool } from "./ui-tools.mjs";

const field = (page, name) => page.getByRole("textbox", { name, exact: true });
const button = (page, name) => page.getByRole("button", { name, exact: true });
export async function reopen(page, shortcut = "Meta+r") {
  await page.locator("#world canvas").focus();
  await page.keyboard.press(shortcut);
  await page.waitForFunction(() => {
    const state = window.makeshiftInspect();
    return (
      !state.busy &&
      state.interaction?.phase === "editing" &&
      state.preview &&
      state.commands.every((command) => command.unavailable !== "Switching tools…")
    );
  });
  return inspect(page);
}

export async function reopenExtrude(page, name) {
  const { center } = await plate(page);
  await page.mouse.click(center.x + 30, center.y + 30);
  const source = await inspect(page),
    before = source.document;
  await page.keyboard.press("e");
  await field(page, "Extrusion distance").fill("2");
  await inspect(page);
  await button(page, "Union").click();
  await inspect(page);
  await button(page, "Accept extrusion").click();
  const accepted = (await completed(page)).document;
  const acceptedResult = await resultState(page, accepted);
  close(accepted.bodies[0].volume, before.bodies[0].volume + 800);
  // A later result selection and view change must not hide the geometry operation.
  await button(page, "Select Body 1").click();
  await page.mouse.wheel(15, 20);
  let state = await reopen(page);
  assert.equal(state.interaction.kind, "extrude");
  assert.deepEqual(state.document, before);
  selections(state, source);
  assert.equal(await field(page, "Extrusion distance").inputValue(), "2");
  assert.equal(await button(page, "Union").getAttribute("aria-pressed"), "true");
  close(state.preview.bodies[0].volume, accepted.bodies[0].volume);
  await button(page, "Cancel extrusion").click();
  selections(await resultState(page, before), source);
  await chooseTool(page, "redo", "redo");
  selections(await resultState(page, accepted), acceptedResult);
  state = await reopen(page, "Control+r");
  assert.deepEqual(state.document, before);
  selections(state, source);
  await chooseTool(page, "undo", "undo");
  selections(await resultState(page, before), source);
  await chooseTool(page, "redo", "redo");
  selections(await resultState(page, accepted), acceptedResult);
  await reopen(page);
  await button(page, "New body").click();
  state = await inspect(page);
  assert.equal(state.preview.bodies.length, 2);
  await button(page, "Accept extrusion").click();
  const alternative = (await completed(page)).document;
  const alternativeResult = await resultState(page, alternative);
  assert.equal(alternative.bodies.length, 2);
  assert.equal(alternative.bodies[0].brep, before.bodies[0].brep);
  close(alternative.bodies[1].volume, 800);
  await chooseTool(page, "undo", "undo");
  selections(await resultState(page, before), source);
  await chooseTool(page, "redo", "redo");
  selections(await resultState(page, alternative), alternativeResult);
  await page.screenshot({ path: `.cache/sketch-review/${name}-reopen-extrude-new.png` });
}

export async function reopenExtrudeParameters(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-8, -5], [8, 5]);
  // Explicit dimensions avoid adaptive-grid placement rounding at either runtime.
  await field(page, "Width").fill("16");
  await page.keyboard.press("Enter");
  await inspect(page);
  await field(page, "Height").fill("10");
  await page.keyboard.press("Enter");
  const drawn = (await inspect(page)).document.sketches[0];
  const area =
    Math.abs(
      drawn.curves.reduce((sum, curve) => {
        assert.equal(curve.kind, "segment");
        return sum + curve.a.x * curve.b.y - curve.a.y * curve.b.x;
      }, 0),
    ) / 2;
  close(area, 160, "precise source area");
  const center = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  const source = await inspect(page),
    before = source.document;
  await field(page, "Extrusion distance").fill("6");
  await inspect(page);
  await page.getByRole("checkbox", { name: "Symmetric extrusion" }).check();
  await inspect(page);
  await page.getByRole("combobox", { name: "Draft measurement" }).selectOption("offset");
  await field(page, "Draft value").fill("1");
  await inspect(page);
  await field(page, "Extrusion twist").fill("30");
  await inspect(page);
  await button(page, "New body").click();
  await inspect(page);
  await button(page, "Accept extrusion").click();
  const accepted = (await completed(page)).document;
  const acceptedResult = await resultState(page, accepted);
  // Each symmetric half sweeps 3 mm through widths 16→18 and heights 10→12.
  assert.ok(Math.abs(accepted.bodies[0].volume - 1124) < 1e-3, "independent draft/twist volume");
  const acceptedOperation = (await page.evaluate(() => window.makeshiftHistory())).findLast(
    (entry) =>
      entry.state === "applied" &&
      entry.outcome === "changed" &&
      !["navigation", "selection"].includes(entry.operation.kind),
  );
  assert.equal(acceptedOperation.operation.kind, "extrude");
  assert.equal(acceptedOperation.operation.parameters.extrusion.symmetric, true);
  assert.equal(acceptedOperation.operation.parameters.extrusion.twist.angle, 30);
  assert.deepEqual(acceptedOperation.operation.parameters.extrusion.draft, {
    mode: "offset",
    value: 1,
  });
  await chooseTool(page, "reopen last operation", "reopen-operation");
  const state = await inspect(page);
  assert.deepEqual(state.document, before);
  selections(state, source);
  assert.equal(await field(page, "Extrusion distance").inputValue(), "6");
  assert.equal(await page.getByRole("checkbox", { name: "Symmetric extrusion" }).isChecked(), true);
  assert.equal(
    await page.getByRole("combobox", { name: "Draft measurement" }).inputValue(),
    "offset",
  );
  assert.equal(await field(page, "Draft value").inputValue(), "1");
  assert.equal(await field(page, "Extrusion twist").inputValue(), "30");
  close(state.preview.bodies[0].volume, accepted.bodies[0].volume);
  assert.deepEqual(state.preview.bodies[0].bounds, accepted.bodies[0].bounds);
  await page.screenshot({ path: `.cache/sketch-review/${name}-reopen-extrude-parameters.png` });
  await button(page, "Cancel extrusion").click();
  selections(await resultState(page, before), source);
  await chooseTool(page, "redo", "redo");
  selections(await resultState(page, accepted), acceptedResult);
  await reopen(page);
  // With no local edits, Undo cancels at the restored baseline instead of reverting parameters.
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).interaction, null);
  selections(await resultState(page, before), source);
  await chooseTool(page, "redo", "redo");
  selections(await resultState(page, accepted), acceptedResult);
}

async function operands(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  const picks = [];
  for (const [a, b] of [
    [
      [-10, -10],
      [10, 10],
    ],
    [
      [20, -6],
      [30, 6],
    ],
  ]) {
    await drag(page, a, b);
    picks.push(await at(page, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2));
  }
  await chooseTool(page, "return to modeling", "modeling");
  for (const point of picks) {
    await page.mouse.click(point.x, point.y);
    await field(page, "Extrusion distance").fill("3");
    await inspect(page);
    await button(page, "Accept extrusion").click();
    await inspect(page);
  }
  await button(page, "Select Body 2").click();
  await page.keyboard.press("m");
  await button(page, "Move body X").click();
  await page.locator(".body-transform-value").fill("-15");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Escape");
}

export async function reopenBoolean(page, name) {
  await operands(page);
  await button(page, "Select Body 2").click();
  await button(page, "Select Body 1").click({ modifiers: ["Meta"] });
  const source = await inspect(page),
    before = source.document;
  await chooseTool(page, "Subtract", "subtract");
  await inspect(page);
  assert.equal(await button(page, "Change subtraction target").textContent(), "Target: Body 2 ↔");
  await button(page, "Commit and clean up").click();
  const accepted = (await completed(page)).document;
  const acceptedResult = await resultState(page, accepted);
  assert.equal(accepted.bodies.length, 1);
  close(accepted.bodies[0].volume, 180);
  let state = await reopen(page);
  assert.equal(state.interaction.kind, "body-boolean");
  assert.deepEqual(state.document, before);
  selections(state, source);
  assert.equal(await button(page, "Change subtraction target").textContent(), "Target: Body 2 ↔");
  assert.equal(await button(page, "Keep originals").getAttribute("aria-pressed"), "false");
  const completion = page.getByRole("checkbox", { name: "Clean up on acceptance" });
  assert.equal(await completion.isChecked(), true);
  await button(page, "Cancel Boolean").click();
  selections(await resultState(page, before), source);
  await chooseTool(page, "redo", "redo");
  selections(await resultState(page, accepted), acceptedResult);
  await reopen(page);
  await chooseTool(page, "undo", "undo");
  selections(await resultState(page, before), source);
  await chooseTool(page, "redo", "redo");
  selections(await resultState(page, accepted), acceptedResult);
  await reopen(page);
  await button(page, "Keep originals").click();
  state = await inspect(page);
  assert.equal(state.preview.bodies.length, 2);
  await completion.uncheck();
  await button(page, "Accept Boolean").click();
  const alternative = (await completed(page)).document;
  const alternativeResult = await resultState(page, alternative);
  assert.equal(alternative.bodies.length, 2);
  assert.ok(alternative.bodies.some((body) => body.brep === before.bodies[0].brep));
  const history = await page.evaluate(() => window.makeshiftHistory());
  const latest = history.findLast(
    (entry) =>
      entry.outcome === "changed" &&
      entry.state === "applied" &&
      !["navigation", "selection"].includes(entry.operation.kind),
  );
  assert.equal(latest.operation.kind, "boolean-bodies");
  assert.equal(latest.operation.parameters.cleanup, undefined);
  await chooseTool(page, "undo", "undo");
  selections(await resultState(page, before), source);
  await chooseTool(page, "redo", "redo");
  selections(await resultState(page, alternative), alternativeResult);
  await page.screenshot({ path: `.cache/sketch-review/${name}-reopen-boolean-keep.png` });
}

function selections(actual, expected) {
  assert.deepEqual(actual.modelingSelection, expected.modelingSelection, "ordered model selection");
  assert.deepEqual(actual.selectionTargets, expected.selectionTargets, "ordered sketch selection");
}
async function resultState(page, document) {
  await page.evaluate(() => window.makeshiftHistory());
  const state = await completed(page);
  assert.deepEqual(state.document, document);
  return state;
}
