import assert from "node:assert/strict";
import { resolve } from "node:path";
import { orient } from "./ui-blend-edit.mjs";
import { decoratorCylinder } from "./ui-decorator-cylinder.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { inspect } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

await withUiRuntimes(
  async (page, name) => {
    const original = await decoratorCylinder(page);
    for (const [tool, label] of [
      ["threads", "Remove thread decorator from selected faces"],
      ["knurling", "Remove knurling decorator from selected faces"],
      ["gear", "Remove Gear decorator from selected faces"],
    ]) {
      await chooseTool(page, tool, tool);
      await removeAndUndo(page, label, original);
    }
    await orient(page, [1, -1, 1]);
    await worldClick(page, [2, -2, 10]);
    await chooseTool(page, "decorator library", "decorator-library");
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Import decorator bundle", exact: true }).click();
    await (await chooser).setFiles(resolve("examples/decorators/raised-pad.json"));
    await page.getByRole("button", { name: "Enable Raised pad code", exact: true }).click();
    await page.getByRole("button", { name: "Apply Raised pad", exact: true }).click();
    await page.getByRole("button", { name: "Close decorator library", exact: true }).click();
    await removeAndUndo(page, "Remove Raised pad decorator from selected faces", original);
    console.log(
      `${name}: explicit thread, knurling, gear and custom removal labels; removal and Undo passed`,
    );
  },
  { timeout: 30000 },
);

async function removeAndUndo(page, label, original) {
  const decorated = (await inspect(page)).document.decorators;
  assert.equal(decorated.length, 1);
  await page.getByRole("button", { name: label, exact: true }).click();
  assert.equal((await inspect(page)).document.decorators.length, 0);
  assert.deepEqual((await inspect(page)).document.bodies, original.bodies);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document.decorators, decorated);
  await chooseTool(page, "redo", "redo");
  assert.equal((await inspect(page)).document.decorators.length, 0);
}
