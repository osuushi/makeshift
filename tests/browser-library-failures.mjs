import assert from "node:assert/strict";
import { nameDrawing } from "./browser-library-helpers.mjs";
import { drag, settled } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Inject a transaction abort after put succeeds: success of the request is not a committed save.
export async function libraryFailure(page) {
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-35, -25], [-25, -15]);
  await page.evaluate(() => {
    window.originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = window.originalPut.apply(this, args);
      request.addEventListener("success", () => this.transaction.abort());
      return request;
    };
  });
  await chooseTool(page, "save", "save");
  await nameDrawing(page, "Failed save");
  await page.getByRole("alert").filter({ hasText: "Browser save failed." }).waitFor();
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = window.originalPut;
  });
  await chooseTool(page, "save", "save");
  // Failure must not assign an identity; first-save naming must appear again.
  await page
    .getByRole("dialog", { name: "Save drawing" })
    .getByText("Cancel", { exact: true })
    .click();
  await settled(page);
  await chooseTool(page, "new", "new");
  await page
    .getByRole("dialog", { name: "Unsaved changes" })
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await chooseTool(page, "open", "open");
  const picker = page.getByRole("dialog", { name: "Open drawing" });
  assert.equal(await picker.getByRole("button", { name: /^Failed save ·/ }).count(), 0);
  await picker.getByText("Cancel", { exact: true }).click();
}
