import assert from "node:assert/strict";
import { drag, inspect } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Real pointer routes cover flyout crossings, click suppression after moves and shared settings.
await withUiRuntimes(
  async (page, name) => {
    await page.evaluate(() => localStorage.removeItem("makeshift.toolbox.v1"));
    await page.waitForLoadState("networkidle");
    await page.reload();
    await page.waitForFunction(() => !!window.makeshiftInspect);
    const root = page.locator(".toolbox-grid");
    const cube = root.locator('[data-tool="cube"]');
    await cube.hover();
    const menu = page.locator(".toolbox-flyout").last();
    await menu.locator('[data-tool="cylinder"]').click();
    await page.waitForFunction(() => window.makeshiftInspect().interaction?.kind === "cylinder");
    assert.equal(await root.locator('[data-tool="cylinder"]').count(), 1);
    await page.keyboard.press("Escape");
    await root.locator('[data-tool="cylinder"]').hover();
    await movePointer(
      page,
      menu.locator('[data-tool="cylinder"]'),
      menu.locator('[data-tool="sphere"]'),
    );
    let tree = await stored(page);
    assert.deepEqual(tree.items[4].items[1].items, ["sphere", "cylinder"]);
    assert.equal((await inspect(page)).interaction, null, "Dragging does not launch a tool");
    await root.locator('[data-tool="cube"]').hover();
    await page.locator('.toolbox-flyout [data-tool="sphere"]').hover();
    assert.equal(await page.locator(".toolbox-flyout").count(), 2);
    await page.locator(".toolbox-flyout").last().locator('[data-tool="cylinder"]').click();
    await page.keyboard.press("Escape");
    tree = await stored(page);
    assert.equal(tree.items[4].selected, 1);
    assert.equal(tree.items[4].items[1].selected, 1);
    await page.waitForLoadState("networkidle");
    await page.reload();
    await page.waitForFunction(() => !!window.makeshiftInspect);
    assert.equal(await root.locator('[data-tool="cylinder"]').count(), 1);
    await settingsRoute(page);
    await dragIntoGroup(page);
    await chooseTool(page, "sketch on xy", "sketch-xy");
    await root.locator('[data-tool="line"]').hover();
    await page.locator('.toolbox-flyout [data-tool="rectangle"]').click();
    assert.equal(await root.locator('[data-tool="rectangle"]').count(), 1);
    await drag(page, [-10, -8], [10, 8]);
    assert.equal((await inspect(page)).document.sketches[0].curves.length, 4);
    await focusAndTouch(page, name);
    await page.mouse.move(700, 500);
    await page.screenshot({ path: `.cache/sketch-review/${name}-nested-toolbox.png` });
    console.log(
      `${name}: hover, nested selection, toolbox grouping, persistence, settings moves/reset and real rectangle passed`,
    );
  },
  { hasTouch: true },
);

async function dragIntoGroup(page) {
  const root = page.locator(".toolbox-grid");
  await root.locator('[data-tool="line"]').hover();
  const source = await page.locator('.toolbox-flyout [data-tool="circle"]').boundingBox();
  const target = await root.locator('[data-tool="cube"]').boundingBox();
  assert.ok(source && target);
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
  await page.locator('.toolbox-flyout [data-tool="sphere"]').waitFor();
  const sphere = await page.locator('.toolbox-flyout [data-tool="sphere"]').boundingBox();
  assert.ok(sphere);
  await page.mouse.move(sphere.x + sphere.width / 2, sphere.y + 2, { steps: 4 });
  await page.mouse.up();
  assert.deepEqual((await stored(page)).items[4].items.slice(0, 4), [
    "cube",
    "cylinder",
    "circle",
    "sphere",
  ]);
}

async function settingsRoute(page) {
  await page.getByRole("button", { name: "Application settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await dialog.getByRole("tab", { name: "Toolbox", exact: true }).click();
  const tree = dialog.locator(".toolbox-settings-tree");
  const row = (path) => tree.locator(`[data-toolbox-path='${JSON.stringify(path)}']`);
  const before = (await inspect(page)).document;
  await movePointer(page, row([2, 0]), row([2, 1]));
  assert.deepEqual((await stored(page)).items[2].items[0].items, ["rectangle", "line"]);
  await row([2, 0, 1]).getByRole("button", { name: "Move out of group", exact: true }).click();
  assert.deepEqual((await stored(page)).items[2].items.slice(0, 2), ["rectangle", "line"]);
  await row([2]).getByRole("button", { name: "Move up", exact: true }).click();
  assert.deepEqual((await stored(page)).items[1].items.slice(0, 2), ["rectangle", "line"]);
  assert.deepEqual((await inspect(page)).document, before);
  await dialog.getByRole("button", { name: "Reset toolbox to defaults", exact: true }).click();
  assert.equal((await stored(page)).items[4].items[1], "cylinder");
  assert.equal((await stored(page)).items[2].items[0], "line");
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
}
async function stored(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("makeshift.toolbox.v1")));
}
async function movePointer(page, from, to) {
  await from.scrollIntoViewIfNeeded();
  await to.scrollIntoViewIfNeeded();
  const a = await from.boundingBox(),
    b = await to.boundingBox();
  assert.ok(a && b);
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
}

// Hover must not accept a pending numeric edit; touch needs a deliberate expander.
async function focusAndTouch(page, name) {
  const width = page.getByRole("textbox", { name: "Width", exact: true });
  await width.fill("24");
  const before = (await inspect(page)).document;
  const cube = page.locator('.toolbox-grid [data-tool="cube"]');
  await cube.hover();
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".toolbox-flyout").count(), 0);
  assert.equal(await width.inputValue(), "24");
  assert.equal(await width.evaluate((e) => e === document.activeElement), true);
  assert.deepEqual((await inspect(page)).document, before);
  await cube.hover();
  await page.keyboard.press("Control+f");
  assert.equal(await page.getByRole("dialog", { name: "Find a tool" }).isVisible(), true);
  assert.equal(await page.locator(".toolbox-flyout").count(), 0);
  await page.keyboard.press("Escape");
  assert.equal(await width.inputValue(), "24");
  assert.equal(await width.evaluate((e) => e === document.activeElement), true);
  if (name !== "electron") {
    await page.getByRole("button", { name: "Alternatives for Cube", exact: true }).tap();
    assert.equal(await page.locator(".toolbox-flyout").count(), 1);
    assert.deepEqual((await inspect(page)).document, before);
    await page.keyboard.press("Escape");
  }
  await width.press("Enter");
  await inspect(page);
  await cube.hover();
  await cube.focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.locator(".toolbox-flyout").count(), 1);
  await page.keyboard.press("ArrowDown");
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute("data-tool")),
    "cylinder",
  );
  await page.keyboard.press("ArrowLeft");
  assert.equal(await page.locator(".toolbox-flyout").count(), 0);
  assert.equal(await cube.evaluate((e) => e === document.activeElement), true);
}
