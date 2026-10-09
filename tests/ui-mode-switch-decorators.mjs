import assert from "node:assert/strict";
import { decoratorCylinder } from "./ui-decorator-cylinder.mjs";
import { close, inspect, modalCompleted } from "./ui-helpers.mjs";
import {
  appliedSwitchHistory,
  switchUndoRedo,
  switchViewUndoRedo,
} from "./ui-mode-switch-history.mjs";
import { assertNavigation, navigationHistory, navigationIdle } from "./ui-navigation-history.mjs";
import { relativeOffsetInput } from "./ui-offset-input.mjs";
import { browseTools, chooseTool } from "./ui-tools.mjs";

const preset = (page) => page.getByRole("combobox", { name: "Preset", exact: true });
const clearance = (page) => page.getByRole("spinbutton", { name: "Clearance", exact: true });
function cylinder(document, radius) {
  assert.equal(document.bodies.length, 1);
  close(document.bodies[0].faces.find((face) => face.cylinder).cylinder.radius, radius, "radius");
  close(document.bodies[0].volume, Math.PI * radius ** 2 * 10, "cylinder volume");
}
async function switched(page) {
  await page.waitForFunction(() => {
    const state = window.makeshiftInspect();
    return !state.busy && state.commands.every((c) => c.unavailable !== "Switching tools…");
  });
}
async function offset(page, distance = "1") {
  await page.getByRole("button", { name: "Offset faces", exact: true }).click();
  const input = await relativeOffsetInput(page);
  await input.fill(distance);
  await inspect(page);
  return input;
}

export async function offsetPresetRoute(page, name) {
  await decoratorCylinder(page, 8);
  await chooseTool(page, "threads", "threads");
  const original = (await inspect(page)).document;
  cylinder(original, 8);
  const input = await offset(page);
  let state = await inspect(page);
  cylinder(state.preview, 9);
  assert.deepEqual(state.document, original);
  const selection = state.modelingSelection;
  await browseTools(page, "Solid");
  state = await inspect(page);
  assert.deepEqual(state.document, original);
  assert.deepEqual(state.modelingSelection, selection);
  cylinder(state.preview, 9);
  await page.keyboard.press("Escape");
  assert.equal(await input.inputValue(), "1");
  assert.equal(await preset(page).isEnabled(), true);
  await preset(page).selectOption("metric");
  await switched(page);
  await modalCompleted(page);
  const metric = (await inspect(page)).document;
  cylinder(metric, 9);
  assert.equal(metric.decorators[0].id, original.decorators[0].id);
  assert.equal(metric.decorators[0].settings.preset, "metric");
  assert.equal(metric.decorators[0].settings.profile, "metric");
  assert.equal(metric.decorators[0].settings.pitch, 2.5, "Preset uses accepted Ø18, not prior Ø16");
  assert.equal(metric.decorators[0].settings.clearance, 0.1);
  await chooseTool(page, "undo", "undo");
  const acceptedOffset = (await inspect(page)).document;
  cylinder(acceptedOffset, 9);
  assert.deepEqual(acceptedOffset.decorators[0].settings, original.decorators[0].settings);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, acceptedOffset);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, metric);
  console.log(
    `${name}: Offset r8→r9 then Metric resolves Ø18/pitch2.5; discovery, separate exact Undo/Redo passed`,
  );
}

export async function decoratorDraftSwitchRoute(page, name) {
  await decoratorCylinder(page, 8);
  await chooseTool(page, "threads", "threads");
  const original = (await inspect(page)).document;
  await clearance(page).fill("0.4");
  assert.equal((await inspect(page)).preview.decorators[0].settings.clearance, 0.4);
  await preset(page).selectOption("metric");
  await switched(page);
  await modalCompleted(page);
  const metric = (await inspect(page)).document;
  assert.equal(metric.decorators[0].settings.preset, "metric");
  assert.equal(metric.decorators[0].settings.pitch, 2);
  await chooseTool(page, "undo", "undo");
  const acceptedDraft = (await inspect(page)).document;
  assert.equal(acceptedDraft.decorators[0].settings.clearance, 0.4);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await clearance(page).fill("-1");
  assert.equal((await inspect(page)).preview, null);
  await preset(page).selectOption("metric");
  await switched(page);
  let state = await inspect(page);
  assert.equal(state.interaction, null);
  assert.equal(state.document.decorators[0].settings.preset, "metric");
  // Cancelled invalid clearance is not in the accepted preset change.
  assert.equal(state.document.decorators[0].settings.clearance, 0.1);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await clearance(page).fill("0.3");
  await chooseTool(page, "construction plane", "construction-plane");
  state = await inspect(page);
  assert.equal(state.document.decorators[0].settings.clearance, 0.3);
  assert.equal(state.interaction.kind, "construction-plane");
  await page.keyboard.press("Escape");
  await modalCompleted(page);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  console.log(
    `${name}: numeric draft→preset serial acceptance; invalid draft discarded before preset and fresh valid mode switch passed`,
  );
}

export async function threadApplicationSwitchRoute(page, name) {
  const original = await decoratorCylinder(page, 0.5, 1);
  const before = await inspect(page),
    prior = await appliedSwitchHistory(page);
  await chooseTool(page, "threads", "threads");
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  let state = await inspect(page);
  assert.equal(state.activePlane, "XY");
  assert.equal(state.interaction, null);
  assert.deepEqual(state.document, original);
  await chooseTool(page, "return to modeling", "modeling");
  await navigationHistory(page);
  assertNavigation(await navigationHistory(page), before, "Cancelled application navigation Undo");
  await chooseTool(page, "threads", "threads");
  const pitch = page.getByRole("spinbutton", { name: "Pitch", exact: true });
  await page.getByRole("combobox", { name: "Profile", exact: true }).selectOption("metric");
  await pitch.fill("0.25");
  state = await inspect(page);
  assert.equal(state.preview.decorators[0].settings.pitch, 0.25);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await modalCompleted(page);
  state = await inspect(page);
  assert.equal(state.activePlane, "XY");
  assert.equal(state.activeSketch, null, "Consumed sketch remains hidden in canonical workspace");
  assert.ok(state.projection, "Canonical XY workspace has a planar projection");
  assert.deepEqual(state.document.sketches, original.sketches);
  assert.equal(state.document.decorators.length, 1);
  assert.equal(state.document.decorators[0].settings.pitch, 0.25);
  assert.deepEqual(state.document.bodies, original.bodies);
  const accepted = state.document;
  const entered = await navigationIdle(page);
  await chooseTool(page, "return to modeling", "modeling");
  const left = await navigationIdle(page);
  await switchViewUndoRedo(page, entered, left, before);
  await switchUndoRedo(page, name, before, prior, accepted, "decorator", {
    sketch: before.selectionTargets,
    modeling: before.modelingSelection,
  });
  console.log(
    `${name}: invalid provisional Threads cancels before switching; fresh valid application applies ordinarily before sketch entry passed`,
  );
}

export async function offsetThreadsRoute(page, name) {
  const original = await decoratorCylinder(page, 8);
  await offset(page);
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "threads", "threads");
  await modalCompleted(page);
  const decorated = (await inspect(page)).document;
  cylinder(decorated, 9);
  assert.equal(decorated.decorators.length, 1);
  assert.equal(decorated.decorators[0].faces[0].body, decorated.bodies[0].id);
  assert.ok(decorated.bodies[0].faces.some((f) => f.id === decorated.decorators[0].faces[0].face));
  await chooseTool(page, "undo", "undo");
  const acceptedOffset = (await inspect(page)).document;
  cylinder(acceptedOffset, 9);
  assert.equal(acceptedOffset.decorators?.length ?? 0, 0);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, acceptedOffset);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, decorated);
  console.log(
    `${name}: Offset→Threads refreshes accepted topology and preserves two exact history edits passed`,
  );
}
