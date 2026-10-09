import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { decoratorCylinder } from "./ui-decorator-cylinder.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { close, drag, inspect, modalCompleted, reset } from "./ui-helpers.mjs";
import {
  appliedSwitchHistory,
  switchUndoRedo,
  switchViewUndoRedo,
} from "./ui-mode-switch-history.mjs";
import { navigationIdle } from "./ui-navigation-history.mjs";
import { relativeOffsetInput } from "./ui-offset-input.mjs";
import { findRaycastPoint } from "./ui-plane-targets.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function offset(page, value = "1") {
  await page.getByRole("button", { name: "Offset faces", exact: true }).click();
  const input = await relativeOffsetInput(page);
  await input.fill(value);
  await inspect(page);
  return input;
}
function radius(document, expected) {
  close(document.bodies[0].faces.find((face) => face.cylinder).cylinder.radius, expected, "radius");
  close(document.bodies[0].volume, Math.PI * expected ** 2 * 10, "volume");
}

export async function geometrySwitchRoute(page, name) {
  await decoratorCylinder(page, 8);
  const before = await inspect(page),
    prior = await appliedSwitchHistory(page);
  await offset(page);
  radius((await inspect(page)).preview, 9);
  await chooseTool(page, "Select owning bodies", "selection-bodies");
  await modalCompleted(page);
  const accepted = (await inspect(page)).document;
  radius(accepted, 9);
  assert.deepEqual((await inspect(page)).modelingSelection, [
    { kind: "body", body: accepted.bodies[0].id },
  ]);
  await chooseTool(page, "mirror", "mirror");
  assert.equal((await inspect(page)).interaction.kind, "mirror");
  assert.deepEqual((await inspect(page)).document, accepted);
  await page.keyboard.press("Escape");
  await modalCompleted(page);
  const side = accepted.bodies[0].faces.find((face) => face.cylinder);
  await switchUndoRedo(page, `${name}-selection`, before, prior, accepted, "offset-faces", {
    sketch: [],
    modeling: [{ kind: "face", body: accepted.bodies[0].id, face: side.id }],
  });
  // A separate Offset finishes before direct canonical-plane entry.
  await decoratorCylinder(page, 8);
  await orient(page, [0, 0, 1]);
  const planeBefore = await inspect(page),
    planePrior = await appliedSwitchHistory(page);
  await offset(page);
  const plane = await findRaycastPoint(page, "XY");
  await page.mouse.dblclick(plane.x, plane.y);
  await modalCompleted(page);
  const state = await inspect(page);
  radius(state.document, 9);
  assert.equal(state.activePlane, "XY");
  assert.equal(state.activeSketch, null, "Consumed sketch remains hidden in canonical workspace");
  assert.ok(state.projection, "Canonical XY workspace has a planar projection");
  assert.deepEqual(state.document.sketches, planeBefore.document.sketches);
  const entered = await navigationIdle(page);
  await chooseTool(page, "return to modeling", "modeling");
  const left = await navigationIdle(page),
    planeAccepted = left.document;
  await switchViewUndoRedo(page, entered, left, planeBefore);
  const planeSide = planeAccepted.bodies[0].faces.find((face) => face.cylinder);
  await switchUndoRedo(
    page,
    `${name}-plane`,
    planeBefore,
    planePrior,
    planeAccepted,
    "offset-faces",
    {
      sketch: [],
      modeling: [{ kind: "face", body: planeAccepted.bodies[0].id, face: planeSide.id }],
    },
  );
  console.log(
    `${name}: Offset→selection→Mirror and direct Sketch plane entry preserve accepted geometry/history passed`,
  );
}

export async function sketchNumericSwitchRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("c");
  await drag(page, [0, 0], [8, 0]);
  const before = await inspect(page),
    original = before.document;
  const prior = await appliedSwitchHistory(page);
  const radiusInput = page.getByRole("textbox", { name: "Radius", exact: true });
  await radiusInput.fill("-1");
  await chooseTool(page, "Rectangle", "rectangle");
  let state = await inspect(page);
  assert.deepEqual(state.document, original);
  assert.equal(state.interaction, null);
  assert.equal(state.tool, "rectangle");
  // Reselect the circle and begin a fresh valid edit after discard.
  await page.keyboard.press("v");
  const { click } = await import("./ui-helpers.mjs");
  await click(page, 8, 0);
  await radiusInput.fill("9");
  await chooseTool(page, "Rectangle", "rectangle");
  await modalCompleted(page);
  state = await inspect(page);
  assert.equal(state.tool, "rectangle");
  assert.equal(state.document.sketches[0].curves[0].kind, "circle");
  close(state.document.sketches[0].curves[0].radius, 9);
  const accepted = state.document;
  await switchUndoRedo(page, name, before, prior, accepted, "edit", {
    sketch: before.selectionTargets,
    modeling: before.modelingSelection,
  });
  console.log(
    `${name}: invalid sketch numeric text cancels; a fresh valid value applies before drawing-tool switch with exact Undo/Redo passed`,
  );
}

export async function offsetInvalidSwitchRoute(page, name) {
  const original = await decoratorCylinder(page, 8);
  await orient(page, [0, 0, 1]);
  const input = await offset(page, "");
  let state = await inspect(page);
  assert.equal(state.preview, null);
  const plane = await findRaycastPoint(page, "XY");
  await page.mouse.dblclick(plane.x, plane.y);
  state = await inspect(page);
  assert.equal(state.activePlane, "XY", "Invalid preview cancels before plane entry");
  assert.equal(state.interaction, null);
  assert.deepEqual(state.document, original);
  await chooseTool(page, "return to modeling", "modeling");
  const body = original.bodies[0];
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  assert.equal((await inspect(page)).modelingSelection[0].body, body.id);
  await chooseTool(page, "Clear selection", "selection-clear");
  await orient(page, [0, -1, 0.3]);
  await worldClick(page, [0, -8, 5]);
  await offset(page);
  await input.fill("1");
  await inspect(page);
  // Existing O remains ordinary Offset ownership; typing in the field cannot switch.
  await input.press("s");
  assert.equal((await inspect(page)).interaction.kind, "face-offset");
  assert.deepEqual((await inspect(page)).document, original);
  await input.fill("1");
  await inspect(page);
  await chooseTool(page, "threads", "threads");
  await modalCompleted(page);
  state = await inspect(page);
  radius(state.document, 9);
  assert.equal(state.document.decorators.length, 1);
  console.log(
    `${name}: invalid Offset cancels before plane entry, local field owns keys, fresh preview accepts before Threads passed`,
  );
}
