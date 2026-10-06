import assert from "node:assert/strict";
import { decoratorCylinder } from "./ui-decorator-cylinder.mjs";
import { at, close, drag, inspect, modalCompleted, reset } from "./ui-helpers.mjs";
import { relativeOffsetInput } from "./ui-offset-input.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function keySwitch(page, key) {
  await page.locator("canvas").focus();
  await page.keyboard.press(key);
  await page.waitForFunction(() => {
    const state = window.makeshiftInspect();
    return !state.busy && state.commands.every((c) => c.unavailable !== "Switching tools…");
  });
}
async function offset(page) {
  await chooseTool(page, "Offset faces", "offset");
  await page.getByRole("button", { name: "Offset faces", exact: true }).click();
  await (await relativeOffsetInput(page)).fill("1");
  await inspect(page);
}

export async function loftErodeSwitchRoute(page, name) {
  await decoratorCylinder(page, 8);
  await chooseTool(page, "threads", "threads");
  const clearance = page.getByRole("spinbutton", { name: "Clearance", exact: true });
  await clearance.fill("0.4");
  // A shortcut must still accept the draft if fresh prerequisites reject its next action.
  await keySwitch(page, "l");
  await modalCompleted(page);
  let state = await inspect(page);
  assert.equal(state.document.decorators[0].settings.clearance, 0.4);
  assert.equal(state.activePlane, null, "Modeling L never becomes sketch Line");
  assert.equal(state.modelingTool, "offset");
  await chooseTool(page, "Clear selection", "selection-clear");
  await keySwitch(page, "l");
  assert.equal((await inspect(page)).interaction.kind, "loft");
  await page.keyboard.press("Escape");
  await modalCompleted(page);
  const original = await decoratorCylinder(page, 8);
  await chooseTool(page, "Select owning bodies", "selection-bodies");
  await offset(page);
  state = await inspect(page);
  close(state.preview.bodies[0].volume, Math.PI * 9 ** 2 * 12, "whole-cylinder offset preview");
  assert.deepEqual(state.document, original);
  const offsetPreview = state.preview;
  await keySwitch(page, "Shift+E");
  state = await inspect(page);
  assert.equal(state.interaction.kind, "face-offset", "Unassigned Shift-E retains Offset");
  assert.deepEqual(state.document, original);
  assert.deepEqual(state.preview, offsetPreview);
  await chooseTool(page, "Erode", "erode");
  await page.waitForFunction(() => {
    const state = window.makeshiftInspect();
    return (
      !state.busy &&
      state.interaction?.kind === "erode" &&
      state.interaction.phase === "editing" &&
      state.preview?.bodies?.length === 2
    );
  });
  state = await inspect(page);
  assert.equal(state.modelingTool, "erode");
  assert.equal(state.interaction.kind, "erode");
  assert.equal(state.interaction.phase, "editing");
  assert.equal(
    await page.getByRole("button", { name: "Accept erosion", exact: true }).isEnabled(),
    true,
  );
  assert.deepEqual(state.preview.bodies[0], state.document.bodies[0]);
  assert.equal(
    await page.getByRole("button", { name: "Erosion distance handle", exact: true }).isVisible(),
    true,
  );
  close(state.document.bodies[0].volume, Math.PI * 9 ** 2 * 12, "accepted whole-cylinder offset");
  const accepted = state.document;
  await page.keyboard.press("Escape");
  await modalCompleted(page);
  assert.deepEqual((await inspect(page)).document, accepted);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  console.log(
    `${name}: L accepts numeric edit/rechecks prerequisites and opens collection; unassigned ShiftE retains the draft; Tools accepts geometry before Erode, exact Undo/Redo passed`,
  );
}

async function operands(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-20, -10], [-10, 10]);
  await drag(page, [10, -10], [20, 10]);
  const left = await at(page, -15, 3),
    right = await at(page, 15, 3);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(left.x, left.y);
  await page.keyboard.down("Shift");
  try {
    await page.mouse.click(right.x, right.y);
  } finally {
    await page.keyboard.up("Shift");
  }
  const profiles = (await inspect(page)).modelingSelection;
  assert.equal(profiles.length, 2, "Held Shift adds the second independent profile");
  assert.equal(new Set(profiles.map((profile) => profile.key)).size, 2);
  for (const profile of profiles) {
    assert.equal(profile.kind, "profile");
    close(profile.area, 200, "seed profile area");
  }
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).fill("5");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  await modalCompleted(page);
  const seeds = (await inspect(page)).document.bodies;
  assert.equal(seeds.length, 2, "Two real independent extrusion seed bodies");
  for (const body of seeds) close(body.volume, 1000, "independent seed extrusion volume");
  await page.getByRole("button", { name: "Select Body 2", exact: true }).click();
  await keySwitch(page, "m");
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  await page.locator(".body-transform-value").fill("-25");
  await page.keyboard.press("Enter");
  await modalCompleted(page);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await page
    .getByRole("button", { name: "Select Body 2", exact: true })
    .click({ modifiers: ["Meta"] });
  const original = (await inspect(page)).document;
  assert.equal(original.bodies.length, 2);
  for (const body of original.bodies) close(body.volume, 1000, "seed cuboid volume");
  return original;
}

export async function booleanSwitchRoute(page, name) {
  for (const [mode, key, expected] of [
    ["union", "Shift+U", 17 * 22 * 7],
    ["subtract", "Shift+S", 5 * 22 * 7],
    ["intersect", "Shift+I", 7 * 22 * 7],
  ]) {
    const original = await operands(page);
    await offset(page);
    let state = await inspect(page);
    assert.deepEqual(state.document, original);
    for (const body of state.preview.bodies)
      close(body.volume, 12 * 22 * 7, "offset cuboid preview");
    await keySwitch(page, key);
    state = await inspect(page);
    assert.equal(state.interaction.kind, "body-boolean", mode);
    for (const body of state.document.bodies)
      close(body.volume, 12 * 22 * 7, "accepted offset before Boolean");
    close(
      state.preview.bodies.reduce((sum, body) => sum + body.volume, 0),
      expected,
      `${mode} preview`,
    );
    const accepted = state.document;
    await page.keyboard.press("Escape");
    await modalCompleted(page);
    assert.deepEqual((await inspect(page)).document, accepted);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, original);
    await chooseTool(page, "redo", "redo");
    assert.deepEqual((await inspect(page)).document, accepted);
  }
  console.log(
    `${name}: nonlocal ShiftU/S/I accept Offset before fresh Boolean preview, exact cancel/Undo/Redo passed`,
  );
}
