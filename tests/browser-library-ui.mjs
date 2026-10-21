import assert from "node:assert/strict";
import { libraryFailure } from "./browser-library-failures.mjs";
import { downloadDrawing, nameDrawing } from "./browser-library-helpers.mjs";
import { drag, inspect, settled } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";
import { browserFileFailures } from "./web-files.mjs";

async function library(page) {
  await chooseTool(page, "open", "open");
  return page.getByRole("dialog", { name: "Open drawing", exact: true });
}

await withUiRuntimes(
  async (page) => {
    await page.addInitScript(() => {
      window.showSaveFilePicker = undefined;
    });
    await page.evaluate(() => {
      window.showSaveFilePicker = undefined;
    });
    await chooseTool(page, "Sketch on XY", "sketch-xy");
    await page.keyboard.press("r");
    await drag(page, [-15, -10], [15, 10]);
    await chooseTool(page, "save", "save");
    await nameDrawing(page, "Bracket");
    const original = await contents(page);
    await chooseTool(page, "save", "save");
    await settled(page);
    assert.equal(await page.getByRole("dialog").count(), 0);
    await page.reload();
    await settled(page);
    let picker = await library(page);
    assert.equal(await picker.locator(".browser-drawings button").count(), 1);
    await picker.getByRole("button", { name: /^Bracket ·/ }).click();
    assert.equal(await contents(page), original);
    await chooseTool(page, "Sketch on XY", "sketch-xy");
    await page.keyboard.press("r");
    await drag(page, [25, 15], [35, 25]);
    const updated = await contents(page);
    assert.notEqual(updated, original);
    await chooseTool(page, "save", "save");
    await settled(page);
    await chooseTool(page, "save as", "save-as");
    await nameDrawing(page, "Bracket copy");
    picker = await library(page);
    assert.equal(await picker.locator(".browser-drawings button").count(), 2);
    await page.screenshot({ path: ".cache/sketch-review/browser-library.png" });
    await picker.getByRole("button", { name: /^Bracket ·/ }).click();
    assert.equal(await contents(page), updated);
    await chooseTool(page, "save as", "save-as");
    await page
      .getByRole("dialog", { name: "Save drawing" })
      .getByText("Cancel", { exact: true })
      .click();
    const downloaded = page.waitForEvent("download");
    await downloadDrawing(page, "Named export");
    const file = await downloaded;
    assert.equal(file.suggestedFilename(), "Named export.makeshift");
    const path = ".cache/sketch-review/browser-library.makeshift";
    await file.saveAs(path);
    await chooseTool(page, "new", "new");
    picker = await library(page);
    const chooser = page.waitForEvent("filechooser");
    await picker.getByRole("button", { name: "Import file…" }).click();
    await (await chooser).setFiles(path);
    assert.equal(await contents(page), updated);
    await browserFileFailures(page);
    await libraryFailure(page);
    console.log(
      "Named saves, quick save, reload, library, copies, cancellation and import/download passed",
    );
  },
  { allowed: ["chromium", "webkit"], defaults: ["chromium"], timeout: 30000 },
);

async function contents(page) {
  const data = (await inspect(page)).document;
  return JSON.stringify({ ...data, bodies: data.bodies ?? [] });
}
