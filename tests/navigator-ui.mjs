import assert from "node:assert/strict";
import { navigatorGroups } from "../src/tools/navigator-tree.ts";
import { drag, inspect } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Window capture and compatibility clicks cross DOM, focus and CAD activation boundaries.
await withUiRuntimes(
  async (page, name) => {
    const before = (await inspect(page)).document;
    const browse = page.getByRole("button", { name: "▦ Browse tools", exact: true });
    const dialog = page.getByRole("dialog", { name: "Browse tools", exact: true });
    const entry = (id) => dialog.locator(`[data-entry="${id}"]`);
    const heading = () => dialog.locator("h2").textContent();
    await browse.click();
    assert.equal(await dialog.isVisible(), true);
    await catalogCoverage(page);
    await unavailableGroups(page, dialog, entry);
    await page.screenshot({ path: `.cache/sketch-review/${name}-navigator-root.png` });
    await entry("utilities").click();
    await entry("references").click();
    await entry("principal-planes").click();
    await entry("back").click();
    assert.match(await heading(), /Planes & references$/);
    await entry("back").click();
    await entry("back").click();
    await entry("draw").click();
    await entry("sketch-entry").click();
    await entry("back").click();
    assert.match(await heading(), /Draw & sketch$/);
    await page.keyboard.press("Escape");
    assert.deepEqual((await inspect(page)).document, before);
    await browse.click();
    await page.keyboard.press("Meta+f");
    assert.equal(await page.getByRole("dialog", { name: "Find a tool" }).isVisible(), true);
    await page.keyboard.press("Escape");

    await browse.click();
    assert.equal(await dialog.locator(".navigator-target, svg").count(), 0);
    assert.match(await entry("shape").textContent(), /Union, Subtract, Intersect/);
    assert.equal(await dialog.getByText("Explore tools").count(), 0);
    // A held pointer crossing cards must neither navigate nor activate on release.
    const draw = await entry("draw").boundingBox();
    const shape = await entry("shape").boundingBox();
    assert.ok(draw && shape);
    await page.mouse.move(draw.x + draw.width / 2, draw.y + draw.height / 2);
    await page.mouse.down();
    await page.mouse.move(shape.x + shape.width / 2, shape.y + shape.height / 2);
    await page.mouse.up();
    assert.equal(await heading(), "Browse tools");
    await entry("draw").click();
    assert.equal(await entry("line").locator("svg").count(), 1);
    assert.equal(await entry("sketch-entry").locator("svg").count(), 0);
    await entry("line").click();
    assert.equal(await dialog.isVisible(), false);
    assert.equal((await inspect(page)).tool, "line");
    assert.deepEqual((await inspect(page)).document, before);

    await browse.focus();
    await page.keyboard.press("Enter");
    assert.equal(await dialog.isVisible(), true);
    await page.keyboard.press("Enter");
    assert.match(await heading(), /Draw & sketch$/);
    await page.keyboard.press("Backspace");
    assert.equal(await heading(), "Browse tools");
    await page.keyboard.press("Escape");
    await geometryRoute(page, name, browse, dialog, entry);

    await tabletRoute(page, name, browse, dialog, entry);
    console.log(
      `${name}: navigator tap routes, drag suppression, group/tool styling, catalog IDs, geometry, Undo/Redo and portrait layout pass`,
    );
  },
  { hasTouch: true },
);

async function geometryRoute(page, name, browse, dialog, entry) {
  await chooseTool(page, "sketch on xy", "sketch-xy");
  await browse.click();
  await entry("draw").click();
  await entry("rectangle").click();
  await drag(page, [-12, -8], [12, 8]);
  assert.equal((await inspect(page)).document.sketches[0].curves.length, 4);
  await numericFocusRoute(page, browse, entry);
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.sketches[0]?.curves.length ?? 0, 0);
  await chooseTool(page, "redo", "redo");
  assert.equal((await inspect(page)).document.sketches[0].curves.length, 4);

  await browse.click();
  await entry("shape").click();
  await entry("combine").click();
  assert.equal(await entry("union").getAttribute("aria-disabled"), "true");
  const slots = await dialog
    .locator(".navigator-card")
    .evaluateAll((cards) => cards.map((c) => c.getAttribute("data-entry")));
  await entry("cancel").click();
  await chooseTool(page, "return to modeling", "modeling");
  await browse.click();
  await entry("shape").click();
  await entry("combine").click();
  assert.deepEqual(
    await dialog
      .locator(".navigator-card")
      .evaluateAll((cards) => cards.map((c) => c.getAttribute("data-entry"))),
    slots,
  );
  await page.screenshot({ path: `.cache/sketch-review/${name}-navigator-combine.png` });
  await entry("union").click();
  await page.waitForFunction(
    () => window.makeshiftInspect().interaction?.kind === "tool-selection",
  );
  await page.keyboard.press("Escape");
}

async function numericFocusRoute(page, browse, entry) {
  const field = page.getByRole("textbox", { name: "Width", exact: true });
  await field.fill("27");
  const before = (await inspect(page)).document;
  await browse.click();
  assert.equal(await entry("constrain").getAttribute("data-unavailable"), "false");
  await entry("shape").click();
  await entry("cancel").click();
  assert.equal(await field.inputValue(), "27");
  assert.equal(await field.evaluate((element) => element === document.activeElement), true);
  assert.deepEqual((await inspect(page)).document, before);
  await page.keyboard.press("Escape");
}

async function catalogCoverage(page) {
  const commands = (await inspect(page)).commands;
  const leaves = new Set(
    Object.values(navigatorGroups)
      .flatMap((g) => g.entries)
      .filter((id) => !navigatorGroups[id]),
  );
  const availableIds = new Set(commands.map((c) => c.id));
  for (const id of leaves) assert.ok(availableIds.has(id), `Registered navigator tool: ${id}`);

  const standard = new Set([
    "undo",
    "redo",
    "new",
    "open",
    "save",
    "save-as",
    "close",
    "delete",
    "copy",
    "paste",
    "select-all-entities",
    "download-document",
    "licenses",
  ]);
  for (const id of availableIds)
    assert.ok(leaves.has(id) || standard.has(id), `Navigator coverage: ${id}`);
}

async function tabletRoute(page, name, browse, dialog, entry) {
  await page.setViewportSize({ width: 820, height: 1180 });
  if (name === "electron") await browse.click();
  else await tap(page, browse);
  assert.equal(await dialog.locator(".navigator-card").count(), 6);
  const columns = await dialog
    .locator(".navigator-grid")
    .evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(" ").length);
  assert.equal(columns, 2);
  const bounds = await dialog.boundingBox();
  assert.ok(
    bounds &&
      bounds.x >= 0 &&
      bounds.y >= 0 &&
      bounds.x + bounds.width <= 820 &&
      bounds.y + bounds.height <= 1180,
  );
  await page.screenshot({ path: `.cache/sketch-review/${name}-navigator-portrait.png` });
  if (name !== "electron") {
    await tap(page, entry("constrain"));
    assert.match(await dialog.locator("h2").textContent(), /Constrain$/);
    await tap(page, entry("back"));
  }
  await page.keyboard.press("Escape");
}

async function tap(page, locator) {
  const bounds = await locator.boundingBox();
  assert.ok(bounds);
  // Opening on pointerdown changes the hit target before WebKit delivers touchstart.
  await page.touchscreen.tap(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
}

// Group availability must propagate through nested groups without blocking exploration.
async function unavailableGroups(page, dialog, entry) {
  assert.equal(await entry("constrain").getAttribute("data-unavailable"), "true");
  assert.equal(await entry("constrain").getAttribute("aria-disabled"), "false");
  await entry("constrain").click();
  assert.equal(await entry("direction").getAttribute("data-unavailable"), "true");
  await entry("direction").click();
  const horizontal = entry("constraint-horizontal");
  assert.equal(await horizontal.getAttribute("aria-disabled"), "true");
  assert.match(await horizontal.textContent(), /Start or edit a sketch/);
  const before = (await inspect(page)).document;
  const bounds = await horizontal.boundingBox();
  assert.ok(bounds);
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  assert.equal(await dialog.isVisible(), true);
  assert.deepEqual((await inspect(page)).document, before);
  await entry("back").click();
  await entry("back").click();
}
