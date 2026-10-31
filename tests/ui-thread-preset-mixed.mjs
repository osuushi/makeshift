import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { openDocument } from "./native-documents.mjs";
import { orient } from "./ui-blend-edit.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Escaped integration failure: a rod and hole share FDM fine but have different taper defaults.
export async function mixedThreadPresetRoute(page, name) {
  const fixture = JSON.parse(await readFile("tests/fixtures/thread-preset-mixed.json", "utf8"));
  await openDocument(page, {
    name: "thread-preset-mixed.makeshift",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ format: "makeshift", version: 1, document: fixture.document }),
    ),
  });
  await orient(page, [1, 0, -1]);
  await worldClick(page, [4, 35.5, 12]);
  await worldClick(page, [-4, 35.5, 32], true);
  let state = await inspect(page);
  assert.deepEqual(
    new Set(state.modelingSelection.map((f) => f.face)),
    new Set(fixture.selection.map((f) => f.face)),
  );
  const preset = page.getByRole("combobox", { name: "Preset", exact: true });
  assert.equal(await preset.inputValue(), "fdm-fine");
  await preset.selectOption("fdm-fine");
  state = await inspect(page);
  const ids = fixture.selection.map(
    (f) => state.document.decorators.find((d) => d.faces.some((r) => r.face === f.face)).id,
  );
  const selected = state.document.decorators.filter((d) => ids.includes(d.id));
  assert.deepEqual(selected.map((d) => d.settings.startTaper).sort(), [0, 1]);
  assert.equal(await preset.inputValue(), "fdm-fine");
  const first = page
    .getByRole("region", { name: "Decorators", exact: true })
    .getByRole("combobox")
    .first();
  assert.equal(await first.getAttribute("aria-label"), "Preset");
  const before = state.document.decoratorPresets;
  const clearance = page.getByRole("spinbutton", { name: "Clearance", exact: true });
  await clearance.fill("0.3");
  await clearance.press("Enter");
  state = await inspect(page);
  assert.deepEqual(
    state.document.decoratorPresets,
    before,
    "Computed presets do not store hidden snapshots",
  );
  const computed = await preset.locator('optgroup[label="Document"] option').allTextContents();
  assert.ok(computed.some((label) => /^FDM fine \[.+\]$/.test(label)));
  assert.equal(await preset.inputValue(), ""); // Different custom taper values remain mixed.
  await chooseTool(page, "undo", "undo");
  assert.equal(await preset.inputValue(), "fdm-fine");
  await page.screenshot({ path: `.cache/sketch-review/${name}-thread-shared-preset.png` });
  console.log(
    `${name}: captured rod/hole shared preset, full-pitch defaults, explicit saving and Undo passed`,
  );
}
