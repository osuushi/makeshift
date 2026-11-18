import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { downloadDrawing, nameDrawing } from "./browser-library-helpers.mjs";
import { documentFixture, followDocument } from "./document-test-page.mjs";
import { openDocument, saveDocument } from "./native-documents.mjs";
import { drag, inspect, reset } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

const hidden = [
  "undo",
  "redo",
  "new",
  "open",
  "save",
  "save-as",
  "close",
  "delete",
  "select-all-entities",
];
async function searchRoute(page) {
  const before = (await inspect(page)).document;
  await page.getByRole("button", { name: "Search tools", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "Find a tool" });
  for (const query of ["undo", "redo", "close", "document", "delete", "select all", "uni"]) {
    await page.getByRole("combobox", { name: "Find a tool" }).fill(query);
    for (const id of hidden) assert.equal(await menu.locator(`[data-command="${id}"]`).count(), 0);
  }
  assert.equal(await menu.locator('[data-command="union"]').count(), 1);
  await page.getByRole("combobox", { name: "Find a tool" }).fill("");
  await page.getByRole("option", { name: "Document & Edit", exact: true }).click();
  for (const id of hidden) assert.equal(await menu.locator(`[data-command="${id}"]`).count(), 0);
  assert.equal(await menu.locator('[data-command="clear-sketch"]').count(), 1);
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, before);
}

async function geometryRoute(page, name) {
  await chooseTool(page, "sketch on xy", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [0, 0], [20, 10]);
  const drawn = (await inspect(page)).document.sketches;
  await page.keyboard.press("Control+z");
  assert.equal((await inspect(page)).document.sketches.length, 0);
  await page.keyboard.press("Control+Shift+z");
  assert.deepEqual((await inspect(page)).document.sketches, drawn);
  const appMenu = page.getByRole("button", { name: "File / Edit", exact: true });
  if (name === "electron") await appMenu.click();
  else await appMenu.tap();
  await page
    .getByRole("menu", { name: "File and edit" })
    .locator('[data-command="select-all-entities"]')
    .click();
  assert.equal((await inspect(page)).selectedCurves.length, 4);
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  assert.equal((await inspect(page)).document.sketches[0].curves.length, 0);
  await page.keyboard.press("Meta+z");
  assert.deepEqual((await inspect(page)).document.sketches, drawn);
  await chooseTool(page, "return to modeling", "modeling");
}

// Mobile browsers can synthesize a click onto a different element after the rail moves on touchend.
async function narrowDocks(page) {
  const left = page.locator('.pane-column[data-side="left"]');
  const right = page.locator('.pane-column[data-side="right"]');
  await page.setViewportSize({ width: 820, height: 1180 });
  await right.locator(".pane-tab").waitFor();
  assert.ok(await left.locator("button.brand").isVisible());
  await page.setViewportSize({ width: 844, height: 390 });
  await left.locator(".pane-tab").waitFor();
  const clicks = await page.evaluateHandle(() => {
    const targets = [];
    const observe = (event) => {
      if (!event.target.closest(".pane-rail")) targets.push(event.target.tagName);
    };
    window.addEventListener("click", observe, true);
    return () => {
      window.removeEventListener("click", observe, true);
      return targets;
    };
  });
  await right.locator(".pane-tab").tap();
  await right.locator(".pane-title").first().waitFor();
  await right.locator(".pane-rail").tap();
  await right.locator(".pane-tab").waitFor();
  assert.deepEqual(await clicks.evaluate((finish) => finish()), []);
  await clicks.dispose();
  await page.setViewportSize({ width: 390, height: 720 });
  await page.locator(".toolbar-app-menu").waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
}

async function route(page, name) {
  await reset(page);
  await searchRoute(page);
  if (name !== "electron") {
    await page.getByRole("button", { name: "File / Edit", exact: true }).tap();
    await page.keyboard.press("Meta+f");
    assert.equal(await page.getByRole("menu", { name: "File and edit" }).isVisible(), false);
    assert.equal(await page.getByRole("dialog", { name: "Find a tool" }).isVisible(), true);
    await page.keyboard.press("Escape");
  }
  await geometryRoute(page, name);
  const original = (await inspect(page)).document.sketches;
  const directory = await mkdtemp(join(tmpdir(), "makeshift-standard-commands-"));
  try {
    const path = join(directory, "drawing.makeshift");
    if (name === "electron") await saveDocument(page, path);
    else {
      await narrowDocks(page);
      await page.getByRole("button", { name: "File / Edit", exact: true }).tap();
      const menu = page.getByRole("menu", { name: "File and edit" });
      const bounds = await menu.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
      assert.equal(await menu.locator('[data-command="undo"]').isEnabled(), true);
      await page.screenshot({ path: `.cache/sketch-review/${name}-standard-file-menu.png` });
      await menu.locator('[data-command="save"]').tap();
      await nameDrawing(page, "Drawing");
      await page.evaluate(() => {
        window.showSaveFilePicker = undefined;
      });
      const downloaded = page.waitForEvent("download");
      await downloadDrawing(page, "Drawing");
      await (await downloaded).saveAs(path);
      await page.setViewportSize({ width: 1280, height: 850 });
    }
    const opened = documentFixture(page)?.session.app.waitForEvent("window");
    await page.getByRole("button", { name: "Search tools", exact: true }).press("Control+n");
    if (opened) await followDocument(page, await opened);
    await page.waitForFunction(() => window.makeshiftInspect?.().document.sketches.length === 0);
    assert.equal((await inspect(page)).document.sketches.length, 0);
    await openDocument(page, path);
    await page.waitForFunction(() => window.makeshiftInspect().document.sketches.length === 1);
    assert.deepEqual((await inspect(page)).document.sketches, original);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  console.log(
    `${name}: standard commands absent from Tools; shortcuts, File/Edit and Save/Open pass`,
  );
}
await withUiRuntimes(route, { hasTouch: true });
