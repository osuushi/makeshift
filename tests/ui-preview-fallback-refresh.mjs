import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { holdPreviews } from "./ui-decorator-worker-control.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { close, inspect } from "./ui-helpers.mjs";
import {
  circleBody,
  coloredFace,
  command,
  completed,
  cylinder,
  marker,
  pickThreadFace,
  releaseDetail,
  threads,
} from "./ui-preview-fallback-helpers.mjs";
import { clearSelection } from "./ui-reconnection-helpers.mjs";

export async function initialFallback(page, name) {
  const plain = await cylinder(page);
  try {
    const attached = await threads(page, true);
    assert.deepEqual(attached.bodies, plain.bodies);
    await page.waitForFunction(() => window.previewTest.replies.length > 0);
    await marker(page, attached);
    await coloredFace(page, `${name}-initial-thread-fallback`);
    await pickThreadFace(page, attached);
    await releaseDetail(page, attached);
    await pickThreadFace(page, attached);
  } finally {
    await holdPreviews(page, false);
  }
}
async function extend(page, variant = false) {
  await clearSelection(page);
  await orient(page, [1, -1, 1]);
  await worldClick(page, [2, -2, 10]);
  const source = (await inspect(page)).modelingSelection;
  assert.equal(source[0]?.kind, "face");
  await command(page, "extrude", "extrude");
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Extrusion distance", exact: true })
    .fill(variant ? "3" : "2");
  await page
    .locator(".extrude-controls")
    .getByRole("button", { name: "Union", exact: true })
    .click();
  const state = await inspect(page);
  assert.equal(state.interaction.kind, "extrude");
  close(state.preview.bodies[0].volume, Math.PI * 64 * (variant ? 13 : 12));
  assert.equal(state.preview.decorators[0].problem, undefined);
  return state.preview;
}
async function subtract(page, variant = false) {
  await clearSelection(page);
  await orient(page, [0, -1, 0.3]);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await page
    .getByRole("button", { name: "Select Body 2", exact: true })
    .click({ modifiers: ["Meta"] });
  const selected = (await inspect(page)).modelingSelection;
  assert.equal(selected.length, 2);
  await command(page, variant ? "union" : "subtract", variant ? "union" : "subtract");
  const state = await inspect(page);
  assert.equal(state.interaction.kind, "body-boolean");
  close(state.preview.bodies[0].volume, Math.PI * (variant ? 64 * 10 + 9 * 2 : 55 * 10));
  assert.equal(state.preview.decorators[0].problem, undefined);
  return state.preview;
}
async function refreshHistory(page, name, before, begin, accept) {
  await holdPreviews(page);
  try {
    let candidate = await begin(page, true);
    const attachment = before.decorators[0];
    assert.deepEqual(candidate.decorators[0].settings, attachment.settings);
    assert.equal(candidate.decorators[0].id, attachment.id);
    await marker(page, candidate);
    await coloredFace(page, `${name}-geometry-candidate-fallback`);
    await page.keyboard.press("Escape");
    let state = await completed(page);
    assert.deepEqual(state.document, before);
    await marker(page, before);
    candidate = await begin(page);
    await marker(page, candidate);
    await page.getByRole("button", { name: accept, exact: true }).click();
    state = await completed(page);
    assert.deepEqual(state.document, candidate);
    const accepted = state.document;
    const resultSelection = state.modelingSelection;
    const resultSketchSelection = state.selectionTargets;
    await marker(page, accepted);
    await coloredFace(page, `${name}-geometry-accepted-fallback`);
    await command(page, "undo", "undo");
    state = await completed(page);
    assert.deepEqual(state.document, before);
    await marker(page, before);
    await command(page, "redo", "redo");
    state = await completed(page);
    assert.deepEqual(state.document, accepted);
    assert.deepEqual(state.modelingSelection, resultSelection);
    assert.deepEqual(state.selectionTargets, resultSketchSelection);
    await marker(page, accepted);
    await page.waitForFunction(() => window.previewTest.replies.length > 0);
    // Deliver the earlier candidate reply while latest accepted geometry is still held.
    await page.evaluate(() => window.previewTest.replies.shift()());
    await marker(page, accepted);
    await releaseDetail(page, accepted);
    await pickThreadFace(page, accepted);
  } finally {
    await holdPreviews(page, false);
  }
}
export async function extrusionFallback(page, name) {
  await cylinder(page);
  const before = await threads(page);
  await refreshHistory(page, `${name}-extrude`, before, extend, "Accept extrusion");
}
export async function booleanFallback(page, name) {
  await cylinder(page);
  await threads(page);
  // Keep the sketch profile outside the existing solid so its ordinary pointer hit is unoccluded.
  await circleBody(page, 3, 12, [20, 0]);
  await page.getByRole("button", { name: "Select Body 2", exact: true }).click();
  await command(page, "transform", "transform");
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  await page.locator(".body-transform-value").fill("-20");
  await page.keyboard.press("Enter");
  const before = (await completed(page)).document;
  assert.equal(before.bodies.length, 2);
  close(before.bodies[1].volume, Math.PI * 9 * 12);
  before.bodies[1].bounds.forEach((value, index) => {
    close(value, [-3, -3, 0, 3, 3, 12][index]);
  });
  await releaseDetail(page, before);
  await refreshHistory(page, `${name}-boolean`, before, subtract, "Accept Boolean");
}
