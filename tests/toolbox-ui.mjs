import assert from "node:assert/strict";
import { drag, inspect } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Real pointer routes cover flyout crossings, click suppression after moves and shared settings.
await withUiRuntimes(
  async (page, name) => {
    await page.evaluate(() => localStorage.removeItem("makeshift.toolbox.v4"));
    await page.waitForLoadState("networkidle");
    await page.reload();
    await page.waitForFunction(() => !!window.makeshiftInspect);
    const root = page.locator(".toolbox-grid");
    assert.equal(await root.locator(":scope > .toolbox-row").count(), 7);
    assert.equal(await root.locator('[data-tool="select"]').count(), 1);
    assert.equal(
      await page.getByRole("button", { name: "Alternatives for Select", exact: true }).count(),
      0,
    );
    const unchanged = await stored(page);
    await movePointer(
      page,
      root.locator('[data-tool="select"]'),
      root.locator('[data-tool="line"]'),
    );
    assert.deepEqual(await stored(page), unchanged, "Select cannot be grouped");
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
    assert.deepEqual(tree.items[2].items.slice(0, 3), ["cube", "sphere", "cylinder"]);
    assert.equal((await inspect(page)).interaction, null, "Dragging does not launch a tool");
    await root.locator('[data-tool="cylinder"]').hover();
    assert.equal(await page.locator(".toolbox-flyout").count(), 1);
    await page.locator(".toolbox-flyout").last().locator('[data-tool="sphere"]').click();
    await page.keyboard.press("Escape");
    tree = await stored(page);
    assert.equal(tree.items[2].selected, 1);
    await page.waitForLoadState("networkidle");
    await page.reload();
    await page.waitForFunction(() => !!window.makeshiftInspect);
    assert.equal(await root.locator('[data-tool="sphere"]').count(), 1);
    await drawerRoute(page);
    await settingsRoute(page);
    await dragIntoGroup(page);
    await chooseTool(page, "return to modeling", "modeling");
    await root.locator('[data-tool="line"]').hover();
    await page.locator('.toolbox-flyout [data-tool="rectangle"]').click();
    assert.equal(await root.locator('[data-tool="rectangle"]').count(), 1);
    const drawing = await inspect(page);
    assert.ok(drawing.activePlane, "Choosing Rectangle enters sketch mode directly");
    assert.equal(drawing.tool, "rectangle");
    assert.equal(drawing.document.sketches.length, 0, "Entering does not create an empty sketch");
    await drag(page, [-10, -8], [10, 8]);
    assert.equal((await inspect(page)).document.sketches[0].curves.length, 4);
    await focusAndTouch(page, name);
    await page.mouse.move(700, 500);
    await page.screenshot({ path: `.cache/sketch-review/${name}-nested-toolbox.png` });
    console.log(
      `${name}: flat alternatives, stable named drawer, drag in/out, persistence, settings and real rectangle passed`,
    );
  },
  { hasTouch: true },
);

// Escaped UI boundary: executing a buried tool must not replace any top-level button.
async function drawerRoute(page) {
  const root = page.locator(".toolbox-grid");
  const labels = await root.locator(".toolbox-item").allTextContents();
  const open = async () => {
    await root.locator('[data-menu="Other Tools"] .toolbox-item').hover();
    await page.locator('.toolbox-flyout [data-menu="Sketch editing"] .toolbox-item').hover();
  };
  await open();
  await page.locator('.toolbox-flyout [data-tool="trim"]').click();
  assert.deepEqual(await root.locator(".toolbox-item").allTextContents(), labels);
  await page.keyboard.press("Escape");
  await open();
  await movePointer(
    page,
    page.locator('.toolbox-flyout [data-tool="trim"]'),
    root.locator('[data-tool="line"]'),
  );
  assert.ok((await stored(page)).items[1].items.includes("trim"));
  await root.locator('[data-tool="line"]').hover();
  const source = await page.locator('.toolbox-flyout [data-tool="trim"]').boundingBox();
  const target = await root.locator('[data-menu="Other Tools"]').boundingBox();
  assert.ok(source && target);
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
  const submenu = page.locator('.toolbox-flyout [data-menu="Sketch editing"]');
  await submenu.waitFor();
  const box = await submenu.boundingBox();
  assert.ok(box);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  const tree = await stored(page);
  assert.equal(tree.items[1].items.includes("trim"), false);
  assert.ok(tree.items[6].items[0].items.includes("trim"));
  assert.equal(tree.items[6].title, "Other Tools");
  assert.deepEqual(await root.locator(".toolbox-item").allTextContents(), labels);
}

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
  assert.deepEqual((await stored(page)).items[2].items.slice(0, 4), [
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
  await movePointer(page, row([1, 0]), row([1, 1]));
  assert.deepEqual((await stored(page)).items[1].items.slice(0, 2), ["rectangle", "line"]);

  await movePointer(page, row([1]), row([2]), 0.95);
  assert.deepEqual((await stored(page)).items[2].items.slice(0, 2), ["rectangle", "line"]);
  assert.deepEqual((await inspect(page)).document, before);
  await dialog.getByRole("button", { name: "Reset toolbox to defaults", exact: true }).click();
  assert.equal((await stored(page)).items[2].items[1], "cylinder");
  assert.equal((await stored(page)).items[1].items[0], "line");
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
}
async function stored(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("makeshift.toolbox.v4")));
}
async function movePointer(page, from, to, fraction = 0.5) {
  await from.scrollIntoViewIfNeeded();
  const a = await from.boundingBox();
  assert.ok(a);
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await to.scrollIntoViewIfNeeded();
  const b = await to.boundingBox();
  assert.ok(b);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height * fraction, { steps: 8 });
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
  // Search must take over from flyouts through the actual button as well as the shortcut.
  const search = page.getByRole("button", { name: "Search tools", exact: true });
  for (const openSearch of [
    () => page.keyboard.press("Control+f"),
    () => search.click(),
    async () => {
      await search.focus();
      await search.press("Enter");
    },
    ...(name === "electron" ? [] : [() => search.tap()]),
  ]) {
    await page.locator('.toolbox-grid [data-menu="Other Tools"] .toolbox-item').hover();
    await page.locator('.toolbox-flyout [data-menu="Sketch editing"] .toolbox-item').hover();
    await openSearch();
    assert.equal(await page.getByRole("dialog", { name: "Find a tool" }).isVisible(), true);
    assert.equal(await page.locator(".toolbox-flyout").count(), 0);
    assert.equal(
      await page
        .getByRole("combobox", { name: "Find a tool" })
        .evaluate((e) => e === document.activeElement),
      true,
    );
    await page.keyboard.press("Escape");
    assert.equal(await width.inputValue(), "24");
    assert.equal(await width.evaluate((e) => e === document.activeElement), true);
    assert.deepEqual((await inspect(page)).document, before);
  }
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
