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
      if (tool === "threads") await selectionShortcut(page, name);
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

// Only real input and layout can verify that this selection widget remains clickable
// beside transform controls and reveals a collapsed Inspector without scrolling the workspace.
async function selectionShortcut(page, name) {
  const before = (await inspect(page)).document;
  const shortcut = page.getByRole("button", { name: "Show decorators in Inspector", exact: true });
  await shortcut.waitFor();
  await page
    .locator(".decorator-selection-actions")
    .screenshot({ path: `.cache/sketch-review/${name}-decorator-shortcut.png` });
  await page.getByRole("button", { name: "Collapse Inspector", exact: true }).click();
  await revealShortcut(page, shortcut);
  await page.getByRole("button", { name: "Decorators", exact: true }).click();
  await page.getByRole("button", { name: "Collapse Inspector", exact: true }).click();
  await page.setViewportSize({ width: 600, height: 400 });
  await revealShortcut(page, shortcut);
  assert.equal(
    await page
      .getByRole("button", { name: "Decorators", exact: true })
      .getAttribute("aria-expanded"),
    "true",
  );
  assert.ok(
    await page.getByRole("button", { name: "Collapse Inspector", exact: true }).isVisible(),
  );
  assert.deepEqual((await inspect(page)).document, before, "Shortcut changes no accepted data");
  await page.setViewportSize({ width: 1280, height: 850 });
  await page.getByRole("button", { name: "Remove decorators from selection", exact: true }).click();
  assert.equal((await inspect(page)).document.decorators.length, 0);
  assert.equal(await shortcut.isVisible(), false);
  assert.deepEqual((await inspect(page)).document.bodies, before.bodies);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document.decorators, before.decorators);
  await chooseTool(page, "redo", "redo");
  assert.equal((await inspect(page)).document.decorators.length, 0);
  await chooseTool(page, "undo", "undo");
  await shortcut.waitFor();
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "body");
  await page.getByRole("button", { name: "Remove decorators from selection", exact: true }).click();
  assert.equal((await inspect(page)).document.decorators.length, 0);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document.decorators, before.decorators);
  await shortcut.click();
  assert.ok((await inspect(page)).modelingSelection.every((target) => target.kind === "face"));
}

async function revealShortcut(page, shortcut) {
  const workspace = await workspaceBounds(page);
  // Record in the click handler, before placement frames can undo a page scroll
  // and leave the canvas showing the shifted frame until the next pointer move.
  await shortcut.evaluate((button) => {
    button.addEventListener(
      "click",
      () => {
        button.dataset.workspaceScroll = JSON.stringify([scrollX, scrollY]);
      },
      { once: true },
    );
  });
  await shortcut.click();
  assert.deepEqual(
    JSON.parse(await shortcut.getAttribute("data-workspace-scroll")),
    workspace.scroll,
    "Inspector reveal cannot transiently scroll the workspace during the click",
  );
  assert.deepEqual(await workspaceBounds(page), workspace, "Workspace bounds stay fixed");
}

async function workspaceBounds(page) {
  return page.evaluate(() => ({
    scroll: [scrollX, scrollY],
    bounds: ["#app", "canvas", "header", "footer"].map((selector) => {
      const { x, y, width, height } = document.querySelector(selector).getBoundingClientRect();
      return { x, y, width, height };
    }),
  }));
}

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
