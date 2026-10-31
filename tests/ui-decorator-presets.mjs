import assert from "node:assert/strict";
import { inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function decoratorPresetRoute(page, name) {
  const preset = page.getByRole("combobox", { name: "Preset", exact: true });
  const clearance = page.getByRole("spinbutton", { name: "Clearance", exact: true });
  const pitch = page.getByRole("spinbutton", { name: "Pitch", exact: true });
  const nozzle = page.getByRole("spinbutton", { name: "Nozzle diameter", exact: true });
  const layer = page.getByRole("spinbutton", { name: "Layer height", exact: true });
  assert.equal(await preset.count(), 1, "One menu combines global and document presets");
  assert.deepEqual(await preset.locator('optgroup[label="Global"] option').allTextContents(), [
    "FDM fine",
    "FDM coarse",
    "Metric",
    "Custom",
  ]);
  assert.equal(
    await page.getByRole("combobox", { name: "Document preset", exact: true }).count(),
    0,
  );
  assert.doesNotMatch(
    await page.getByRole("region", { name: "Decorators", exact: true }).innerText(),
    /Reference Ø/,
  );
  assert.equal(await page.getByRole("spinbutton", { name: "Start inset", exact: true }).count(), 0);
  assert.equal(await page.getByRole("spinbutton", { name: "End inset", exact: true }).count(), 0);
  assert.equal(await nozzle.count(), 0);
  assert.equal(await layer.count(), 0);
  const advanced = page.locator("details.thread-advanced");
  assert.equal(await preset.inputValue(), "fdm-fine");
  assert.equal(await clearance.inputValue(), "0.3");
  assert.equal(await pitch.isVisible(), false);
  assert.equal(await advanced.evaluate((element) => element.open), false);
  assert.match(
    await page.getByRole("region", { name: "Decorators", exact: true }).innerText(),
    /FDM fine starts at 0\.3 mm and FDM coarse at 0\.25 mm.*adjust for your printer and orientation/,
  );
  await page.screenshot({ path: `.cache/sketch-review/${name}-fdm-fine-controls.png` });
  await preset.selectOption("fdm-coarse");
  let settings = (await inspect(page)).document.decorators[0].settings;
  assert.equal(settings.pitch, 1.5);
  assert.equal(settings.startTaper, 1.5);
  assert.equal(settings.endTaper, 1.5);
  assert.equal(settings.profile, "triangle");
  assert.equal(settings.clearance, 0.25);
  assert.equal(settings.tipTruncation, 0.1);
  await clearance.fill("0");
  await clearance.press("Enter");
  assert.equal((await inspect(page)).document.decorators[0].settings.clearance, 0);
  await preset.selectOption("fdm-fine");
  settings = (await inspect(page)).document.decorators[0].settings;
  assert.equal(settings.pitch, 1);
  assert.equal(settings.clearance, 0.3);
  assert.equal(settings.tipTruncation, 0.1);
  await advanced.locator("summary").click();
  const tip = page.getByRole("spinbutton", { name: "Tip truncation", exact: true });
  assert.equal(await tip.inputValue(), "0.1");
  await tip.fill("0.2");
  await tip.press("Enter");
  settings = (await inspect(page)).document.decorators[0].settings;
  assert.equal(settings.tipTruncation, 0.2);
  assert.equal(settings.preset, "custom");
  await chooseTool(page, "undo", "undo");
  settings = (await inspect(page)).document.decorators[0].settings;
  assert.equal(settings.tipTruncation, 0.1);
  assert.equal(settings.preset, "fdm-fine");
  await advanced.locator("summary").click();
  assert.equal(await nozzle.count(), 0);
  await preset.selectOption("metric");
  await inspect(page);
  assert.equal(await nozzle.count(), 0);
  assert.equal(await layer.count(), 0);
  await advanced.locator("summary").click();
  assert.equal(await pitch.isVisible(), true);
  await documentPresetRoute(page, preset, pitch);
}

async function documentPresetRoute(page, preset, pitch) {
  await preset.selectOption("::save");
  const saveDialog = page.getByRole("dialog", { name: "Save preset", exact: true });
  const nameInput = saveDialog.getByLabel("Name", { exact: true });
  assert.equal(await nameInput.inputValue(), "Metric copy");
  await nameInput.fill("Initial pair");
  await nameInput.press("Enter");
  await inspect(page);
  assert.equal(await page.locator('.decorator-panel input[type="text"]').count(), 0);
  await renamePresetRoute(page, preset);
  let saved = (await inspect(page)).document;
  const local = saved.decoratorPresets.find((entry) => entry.name === "Compatible pair");
  assert.ok(local);
  assert.equal(
    await preset
      .locator('optgroup[label="Document"] option')
      .filter({ hasText: "Compatible pair" })
      .count(),
    1,
  );
  await pitch.fill("2.2");
  await pitch.press("Enter");
  saved = (await inspect(page)).document;
  assert.notEqual(
    saved.decoratorPresets.find((entry) => entry.id === local.id).settings.pitch,
    2.2,
  );
  assert.equal(saved.decorators[0].presetId, undefined);
  assert.equal(await preset.locator("option:checked").textContent(), "Compatible pair [Body 1]");
  await preset.selectOption("::save");
  const copyDialog = page.getByRole("dialog", { name: "Save preset", exact: true });
  assert.equal(
    await copyDialog.getByLabel("Name", { exact: true }).inputValue(),
    "Compatible pair [Body 1] copy",
  );
  await copyDialog.getByRole("button", { name: "Save", exact: true }).click();
  const selector = page.getByRole("combobox", { name: "Preset", exact: true });
  await selector.selectOption(local.id);
  await inspect(page);
  await page
    .getByRole("button", { name: "Remove thread decorator from selected faces", exact: true })
    .click();
  await inspect(page);
  await chooseTool(page, "threads", "threads");
  saved = (await inspect(page)).document;
  assert.deepEqual(saved.decorators[0].settings, local.settings);
  assert.equal(
    await selector.inputValue(),
    local.id,
    "A named preset survives removal and is recalled",
  );
}

async function renamePresetRoute(page, preset) {
  const original = (await inspect(page)).document;
  await preset.selectOption("::rename");
  let dialog = page.getByRole("dialog", { name: "Rename preset", exact: true });
  await dialog.getByLabel("Name", { exact: true }).fill("Discard this");
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original, "Escape cannot rename a preset");
  await preset.selectOption("::rename");
  dialog = page.getByRole("dialog", { name: "Rename preset", exact: true });
  await dialog.getByLabel("Name", { exact: true }).fill("Compatible pair");
  await page.screenshot({ path: ".cache/sketch-review/feedback-preset-rename.png" });
  await dialog.getByRole("button", { name: "Rename", exact: true }).click();
  await inspect(page);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original, "Rename is one Undo step");
  await chooseTool(page, "redo", "redo");
  await inspect(page);
}
