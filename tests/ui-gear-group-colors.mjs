import assert from "node:assert/strict";
import { displaySettings } from "./ui-decorator-display.mjs";
import { previewReady } from "./ui-decorator-worker-control.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { inspect, settled } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Group membership and color controls must dispatch document edits and refresh
// both detailed and color-only overlays, without relying on contact detection.
export async function gearGroupColors(page, name) {
  const groups = page.getByRole("region", { name: "Gear groups", exact: true });
  const field = page.getByRole("textbox", { name: "Gears 1 preview hex color", exact: true });
  const original = (await inspect(page)).document;
  const display = groups.getByRole("combobox", { name: "Gears 1 display", exact: true });
  assert.equal(
    await page.getByRole("combobox", { name: "Decorator display", exact: true }).count(),
    0,
  );
  await worldClick(page, [-10, -17, 2]);
  assert.equal((await inspect(page)).modelingSelection.length, 1);
  await display.selectOption("color-only");
  await page.waitForFunction(() =>
    window.makeshiftInspect().document.decorators.every((d) => d.display === "color-only"),
  );
  assert.equal((await inspect(page)).modelingSelection.length, 2);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  for (const [mode, label] of [
    ["texture", "Texture"],
    ["detailed", "Geometry"],
  ]) {
    await displaySettings(page, (dialog) =>
      dialog.getByRole("combobox", { name: "Default decorator display" }).selectOption(mode),
    );
    await display
      .getByRole("option", { name: `Default (${label})`, exact: true })
      .waitFor({ state: "attached" });
  }
  await field.fill("#d53d70");
  await field.press("Enter");
  await settled(page);
  const colored = (await inspect(page)).document;
  assert.ok(colored.decorators.every((d) => d.gearColor === "#d53d70"));
  assert.deepEqual(
    colored.decorators.map((d) => d.settings),
    original.decorators.map((d) => d.settings),
  );
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, colored);
  await worldClick(page, [-10, -17, 2]);
  await groups.getByRole("button", { name: "New gear group from selection", exact: true }).click();
  let state = await inspect(page);
  assert.equal(new Set(state.document.decorators.map((d) => d.gearGroup)).size, 2);
  assert.equal(new Set(state.document.decorators.map((d) => d.gearColor)).size, 2);
  await previewReady(page);
  await page.screenshot({ path: `.cache/sketch-review/${name}-gear-group-colors-detailed.png` });
  await displaySettings(page, async (dialog) => {
    assert.equal(await dialog.getByLabel("Gears preview color", { exact: true }).count(), 0);
    await dialog
      .getByRole("combobox", { name: "Default decorator display" })
      .selectOption("color-only");
  });
  await page.screenshot({ path: `.cache/sketch-review/${name}-gear-group-colors-flat.png` });
  await displaySettings(page, (dialog) =>
    dialog.getByRole("combobox", { name: "Default decorator display" }).selectOption("detailed"),
  );
  await groups.getByRole("button", { name: "Add selection to Gears 1", exact: true }).click();
  state = await inspect(page);
  assert.equal(new Set(state.document.decorators.map((d) => d.gearGroup)).size, 1);
  assert.ok(state.document.decorators.every((d) => d.gearColor === "#d53d70"));
  console.log(
    `${name}: saved group color, Undo/Redo, explicit split/rejoin and both preview modes passed`,
  );
}
