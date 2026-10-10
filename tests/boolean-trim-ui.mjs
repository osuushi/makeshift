import assert from "node:assert/strict";
import { createOperands } from "./ui-body-boolean.mjs";
import { inspect } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Real clicks must forward the experimental choice through preview and acceptance.
await withUiRuntimes(async (page) => {
  await createOperands(page);
  const original = (await inspect(page)).document;
  await page.getByRole("button", { name: "Application settings", exact: true }).click();
  const toggle = page.getByRole("checkbox", { name: "Fast trim checks", exact: true });
  assert.equal(await toggle.isChecked(), false);
  await toggle.check();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await page
    .getByRole("button", { name: "Select Body 2", exact: true })
    .click({ modifiers: ["Meta"] });
  await chooseTool(page, "subtract", "subtract");
  assert.equal(await page.locator(".boolean-widget button").count(), 6);
  await page.getByRole("button", { name: "Accept Boolean", exact: true }).click();
  await page.waitForFunction(() => window.makeshiftInspect().interaction === null);
  const accepted = await inspect(page);
  assert.notDeepEqual(accepted.document, original);
  await page.locator("#world canvas").focus();
  await page.keyboard.press("Meta+r");
  assert.equal((await inspect(page)).interaction?.kind, "body-boolean");
  await page.getByRole("button", { name: "Accept Boolean", exact: true }).click();
  await page.waitForFunction(() => window.makeshiftInspect().interaction === null);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await page.getByRole("button", { name: "Application settings", exact: true }).click();
  assert.equal(await toggle.isChecked(), true);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  console.log("electron: experimental trim toggle previews, accepts and undoes real geometry");
});
