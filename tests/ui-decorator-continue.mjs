import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { orient } from "./ui-blend-edit.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { inspect } from "./ui-helpers.mjs";
import { clearSelection } from "./ui-reconnection-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function customContinueRoute(page, app) {
  await page
    .getByRole("button", { name: "Remove Raised pad decorator from selected faces", exact: true })
    .click();
  await inspect(page);
  await chooseTool(page, "decorator library", "decorator-library");
  await page.getByText("Source for Raised pad", { exact: true }).click();
  assert.match(
    await page
      .getByRole("region", { name: "Decorator library", exact: true })
      .locator("pre")
      .innerText(),
    /export default/,
  );
  if (!app) {
    const waiting = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export Raised pad bundle", exact: true }).click();
    const download = await waiting;
    const bundle = JSON.parse(await readFile(await download.path(), "utf8"));
    assert.equal(bundle.id, "example.raised-pad");
    assert.match(bundle.source, /export default/);
  }
  await page.getByRole("button", { name: "Remove Raised pad bundle", exact: true }).click();
  assert.equal((await inspect(page)).document.decoratorDefinitions.length, 0);
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.decoratorDefinitions.length, 1);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import decorator bundle", exact: true }).click();
  await (await chooser).setFiles(resolve("examples/decorators/linked-pads.json"));
  await page.getByRole("button", { name: "Enable Linked pads code", exact: true }).click();
  await inspect(page);
  await page.getByRole("button", { name: "Apply Linked pads", exact: true }).click();
  await inspect(page);
  await page.getByRole("button", { name: "Close decorator library", exact: true }).click();
  await clearSelection(page);
  await orient(page, [1, -1, -1]);
  const bottom = (await inspect(page)).document.bodies[0].faces
    .filter((f) => f.plane)
    .sort((a, b) => a.signature[5] - b.signature[5])[0]
    .signature.slice(3, 6);
  await worldClick(page, bottom);
  await page
    .getByRole("button", { name: "Continue decorator onto selection", exact: true })
    .click();
  let state = await inspect(page);
  assert.equal(state.document.decorators.length, 1);
  assert.equal(state.document.decorators[0].faces.length, 2);
  assert.equal(state.modelingSelection.length, 2);
  await clearSelection(page);
  await worldClick(page, bottom);
  await page
    .getByRole("button", { name: "Remove Linked pads from selected faces", exact: true })
    .click();
  state = await inspect(page);
  assert.equal(state.document.decorators[0].faces.length, 1);
  await page
    .getByRole("button", { name: "Continue decorator onto selection", exact: true })
    .click();
  assert.equal((await inspect(page)).document.decorators[0].faces.length, 2);
}
