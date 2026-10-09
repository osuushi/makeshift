import assert from "node:assert/strict";
import { decoratorCylinder } from "./ui-decorator-cylinder.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { drag, inspect, modalCompleted, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function changedGeometry(page) {
  return page.evaluate(async () =>
    (await window.makeshiftHistory())
      .filter((entry) => entry.outcome === "changed" && entry.operation.kind !== "selection")
      .map((entry) => entry.id),
  );
}
async function appliedHistory(page) {
  return page.evaluate(async () =>
    (await window.makeshiftHistory()).filter((entry) => entry.state === "applied"),
  );
}
export async function noOpSwitchRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("c");
  const beforeDrawing = await inspect(page);
  const beforeHistory = await appliedHistory(page);
  await drag(page, [0, 0], [8, 0]);
  const originalState = await inspect(page),
    original = originalState.document;
  const history = await changedGeometry(page);
  const originalHistory = await appliedHistory(page);
  const drawingRecords = originalHistory.filter(
    (entry) =>
      !beforeHistory.some((before) => before.id === entry.id) &&
      entry.operation.kind !== "selection",
  );
  assert.equal(drawingRecords.length, 1, "Exactly one drawing Undo entry");
  const input = page.getByRole("textbox", { name: "Radius", exact: true });
  await input.focus();
  assert.equal((await inspect(page)).interaction.kind, "numeric");
  await chooseTool(page, "Rectangle", "rectangle");
  await modalCompleted(page);
  assert.equal((await inspect(page)).tool, "rectangle");
  assert.deepEqual((await inspect(page)).document, original);
  assert.deepEqual(
    await changedGeometry(page),
    history,
    "No-op completion adds no empty document Undo",
  );
  const switchedHistory = await appliedHistory(page);
  assert.deepEqual(switchedHistory.slice(0, originalHistory.length), originalHistory);
  const added = switchedHistory.slice(originalHistory.length);
  assert.equal(added.length, 1, "Rectangle records only its ordinary selection clear");
  assert.equal(added[0].operation.kind, "selection");
  assert.deepEqual((await inspect(page)).selectionTargets, []);
  await chooseTool(page, "undo", "undo");
  const selectionUndo = await inspect(page);
  assert.deepEqual(selectionUndo.document, original);
  assert.deepEqual(selectionUndo.selectionTargets, originalState.selectionTargets);
  assert.equal(
    (await appliedHistory(page)).at(-1).id,
    drawingRecords[0].id,
    "Next applied record is the drawing, not an empty numeric Undo",
  );
  await chooseTool(page, "undo", "undo");
  const geometryUndo = await inspect(page);
  assert.deepEqual(geometryUndo.document, beforeDrawing.document);
  assert.deepEqual(geometryUndo.selectionTargets, beforeDrawing.selectionTargets);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, original);
  assert.deepEqual((await inspect(page)).selectionTargets, []);
  console.log(
    `${name}: checked applied history order`,
    switchedHistory.map((entry) => ({ id: entry.id, kind: entry.operation.kind })),
  );
  console.log(
    `${name}: unchanged numeric edit exits before mode switch, no empty history entry passed`,
  );
}

export async function failedAcceptanceSwitchRoute(page, name) {
  await decoratorCylinder(page, 8);
  await chooseTool(page, "threads", "threads");
  const original = (await inspect(page)).document;
  const history = await changedGeometry(page);
  const clearance = page.getByRole("spinbutton", { name: "Clearance", exact: true });
  await clearance.fill("0.4");
  assert.equal((await inspect(page)).preview.decorators[0].settings.clearance, 0.4);
  // Deliberate acceptance failure, not substitute geometry: successful correction uses the real backend.
  await page.evaluate(async () => {
    const { ModelClient } = await import("/model-client.ts");
    const originalRequest = ModelClient.prototype.request;
    window.acceptanceProbe = {
      calls: 0,
      restore: () => {
        ModelClient.prototype.request = originalRequest;
      },
    };
    ModelClient.prototype.request = async function (request) {
      if (request.kind === "decorator" && request.edit.action === "settings") {
        window.acceptanceProbe.calls++;
        return false;
      }
      return originalRequest.call(this, request);
    };
  });
  try {
    await chooseTool(page, "construction plane", "construction-plane");
    const state = await inspect(page);
    assert.deepEqual(state.document, original);
    assert.equal(state.interaction.kind, "construction-plane");
    assert.equal(state.preview, null);
    assert.equal(await page.evaluate(() => window.acceptanceProbe.calls), 1);
    assert.deepEqual(await changedGeometry(page), history);
  } finally {
    await page.evaluate(() => {
      window.acceptanceProbe.restore();
      delete window.acceptanceProbe;
    });
  }
  await page.keyboard.press("Escape");
  await worldClick(page, [0, -8, 5]);
  await clearance.fill("0.3");
  await chooseTool(page, "construction plane", "construction-plane");
  const state = await inspect(page);
  assert.equal(state.document.decorators[0].settings.clearance, 0.3);
  assert.equal(state.interaction.kind, "construction-plane");
  await page.keyboard.press("Escape");
  await modalCompleted(page);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  console.log(
    `${name}: injected ordinary store rejection discards the draft before switching; fresh real backend acceptance and exact Undo passed`,
  );
}
