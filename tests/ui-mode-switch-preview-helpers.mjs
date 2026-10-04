import assert from "node:assert/strict";
import { inspect } from "./ui-helpers.mjs";
import { appliedSwitchHistory } from "./ui-mode-switch-history.mjs";
import { browseTools, chooseTool } from "./ui-tools.mjs";

export async function browsePreview(page, kind, original, preview, input) {
  // Exercise both ordinary opening routes before an actual command is selected.
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  for (const opening of ["pointer", "keyboard"]) {
    await browseTools(page, "Sketch");
    const state = await inspect(page);
    assert.equal(state.interaction.kind, kind, opening);
    assert.equal(state.interaction.phase, "editing");
    assert.deepEqual(state.document, original);
    assert.deepEqual(state.preview, preview);
    await page.keyboard.press("Escape");
    if (input) assert.equal(await input.inputValue(), "2");
    if (opening === "pointer") await page.keyboard.press("Meta+f");
  }
}

export async function rejectPreviewSwitch(page, kind, before, preview, input) {
  const history = await appliedSwitchHistory(page);
  // Reject only ordinary acceptance. Seed, preview and successful retry use the real backend.
  await page.evaluate(async () => {
    const { ModelClient } = await import("/model-client.ts");
    const originalRequest = ModelClient.prototype.request;
    window.previewAcceptanceProbe = {
      calls: 0,
      restore: () => {
        ModelClient.prototype.request = originalRequest;
      },
    };
    ModelClient.prototype.request = async function (request) {
      if (request.kind === "accept") {
        window.previewAcceptanceProbe.calls++;
        return false;
      }
      return originalRequest.call(this, request);
    };
  });
  try {
    await chooseTool(page, "Rectangle", "rectangle");
    const state = await inspect(page);
    assert.equal(state.interaction.kind, kind);
    assert.equal(state.interaction.phase, "editing");
    assert.deepEqual(state.document, before.document);
    assert.deepEqual(state.preview, preview);
    assert.notEqual(state.tool, "rectangle");
    assert.ok(
      await page.locator(".local-feedback").textContent(),
      "Rejected acceptance shows a clear error",
    );
    if (input) assert.equal(await input.inputValue(), "2");
    assert.equal(await page.evaluate(() => window.previewAcceptanceProbe.calls), 1);
    assert.deepEqual(await appliedSwitchHistory(page), history);
  } finally {
    await page.evaluate(() => {
      window.previewAcceptanceProbe.restore();
      delete window.previewAcceptanceProbe;
    });
  }
}

export async function knownPreviewHistory(page, before) {
  const prior = await appliedSwitchHistory(page);
  assert.ok(prior.length);
  await chooseTool(page, "undo", "undo");
  const undone = await inspect(page);
  assert.deepEqual(
    (await appliedSwitchHistory(page)).map((entry) => entry.id),
    prior.slice(0, -1).map((entry) => entry.id),
  );
  await chooseTool(page, "redo", "redo");
  const redone = await inspect(page);
  assert.deepEqual(redone.document, before.document);
  assert.deepEqual(redone.selectionTargets, before.selectionTargets);
  assert.deepEqual(redone.modelingSelection, before.modelingSelection);
  assert.deepEqual(await appliedSwitchHistory(page), prior);
  return { prior, undone };
}
export async function undoPreview(page, before, history) {
  assert.ok((await inspect(page)).preview);
  await chooseTool(page, "undo", "undo");
  const undone = await inspect(page);
  assert.equal(undone.interaction, null, "Ordinary Undo cancels the preview owner");
  assert.equal(undone.preview, null);
  assert.deepEqual(undone.document, history.undone.document);
  assert.deepEqual(undone.selectionTargets, history.undone.selectionTargets);
  assert.deepEqual(undone.modelingSelection, history.undone.modelingSelection);
  assert.deepEqual(
    (await appliedSwitchHistory(page)).map((entry) => entry.id),
    history.prior.slice(0, -1).map((entry) => entry.id),
  );
  await chooseTool(page, "redo", "redo");
  const redone = await inspect(page);
  assert.deepEqual(redone.document, before.document);
  assert.deepEqual(redone.selectionTargets, before.selectionTargets);
  assert.deepEqual(redone.modelingSelection, before.modelingSelection);
  assert.deepEqual(await appliedSwitchHistory(page), history.prior);
}
