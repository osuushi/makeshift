import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { inspect } from "./ui-helpers.mjs";
import { clearSelection } from "./ui-reconnection-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Computed options are absent from stored preset arrays: exercise menu rendering,
// ID dispatch, tag refresh and application recall across the actual renderer/owner boundary.
// Starts on the mixed rod/hole fixture used by mixedThreadPresetRoute.
export async function ephemeralPresetRoute(page) {
  const preset = page.getByRole("combobox", { name: "Preset", exact: true });
  const pick = async (point) => {
    await clearSelection(page);
    await orient(page, [1, 0, -1]);
    await worldClick(page, point);
  };
  const rod = [4, 35.5, 12],
    hole = [-4, 35.5, 32];
  await pick(rod);
  const clearance = page.getByRole("spinbutton", { name: "Clearance", exact: true });
  await clearance.fill("0.32");
  await clearance.press("Enter");
  assert.match(await preset.locator("option:checked").textContent(), /^FDM fine \[Body \d+\]$/);
  const ephemeral = await preset.inputValue();
  await chooseTool(page, "Tag geometry", "tag-geometry");
  await page.getByRole("textbox", { name: "Group name", exact: true }).fill("Mating thread");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await inspect(page);
  assert.equal(await preset.locator("option:checked").textContent(), "FDM fine [Mating thread]");
  assert.equal(await preset.inputValue(), ephemeral);
  await pick(hole);
  await removeThread(page);
  await chooseTool(page, "threads", "threads");
  assert.equal(
    await preset.inputValue(),
    ephemeral,
    "Application recalls the last computed preset",
  );
  assert.equal(await clearance.inputValue(), "0.32");
  const before = (await inspect(page)).document;
  await preset.selectOption("::rename");
  const dialog = page.getByRole("dialog", { name: "Rename preset", exact: true });
  assert.equal(
    await dialog.getByLabel("Name", { exact: true }).inputValue(),
    "FDM fine [Mating thread]",
  );
  await dialog.getByLabel("Name", { exact: true }).fill("Coupling fit");
  await dialog.getByRole("button", { name: "Rename", exact: true }).click();
  const after = (await inspect(page)).document;
  const saved = after.decoratorPresets.find((p) => p.name === "Coupling fit");
  assert.ok(saved);
  assert.equal(after.decorators.filter((d) => d.presetId === saved.id).length, 2);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, after);
  await removeThread(page);
  await pick(rod);
  await removeThread(page);
  await chooseTool(page, "threads", "threads");
  assert.equal(await preset.locator("option:checked").textContent(), "Coupling fit");
  assert.equal(await clearance.inputValue(), "0.32");
  console.log(
    "Computed preset menu/tag refresh, rod-to-hole recall, shared Rename promotion, removal/reuse and Undo/Redo passed",
  );
}

async function removeThread(page) {
  await page
    .getByRole("button", { name: "Remove thread decorator from selected faces", exact: true })
    .click();
  await inspect(page);
}
