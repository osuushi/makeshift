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
    const center = async (id) => {
      const box = await entry(id).locator(".navigator-target").boundingBox();
      assert.ok(box);
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    await browse.click();
    assert.equal(await dialog.isVisible(), true);
    await catalogCoverage(page);
    await page.screenshot({ path: `.cache/sketch-review/${name}-navigator-root.png` });
    await tapCategoryClearPointer(dialog, entry("references"));
    await entry("principal-planes").click();
    await entry("back").click();
    assert.match(await heading(), /Planes & references$/);
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

    // One held pointer: opening -> category -> tool. Release must not reach the canvas.
    const trigger = await browse.boundingBox();
    assert.ok(trigger);
    await page.mouse.move(trigger.x + trigger.width / 2, trigger.y + trigger.height / 2);
    await page.mouse.down();
    let p = await center("draw");
    await page.mouse.move(p.x, p.y);
    assert.match(await heading(), /Draw & sketch$/);
    // The next screen must visibly clear the pointer, not just block activation.
    await targetsClearPointer(dialog, p);
    const linePosition = await center("line");
    // Staying at the previous target cannot activate a new tool.
    await page.mouse.move(p.x + 1, p.y + 1);
    assert.equal(await dialog.isVisible(), true);
    assert.deepEqual(await center("line"), linePosition, "Targets stay fixed after placement");
    p = await center("line");
    await page.mouse.move(p.x, p.y);
    assert.equal(await dialog.isVisible(), false);
    await page.mouse.up();
    assert.equal((await inspect(page)).tool, "line");
    assert.deepEqual((await inspect(page)).document, before);

    await browse.click();
    p = await center("shape");
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    const bar = await dialog.locator(".navigator-footer").boundingBox();
    assert.ok(bar);
    await page.mouse.move(bar.x + 20, bar.y + 10);
    await page.mouse.up();
    assert.equal(await dialog.isVisible(), false);
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
      `${name}: navigator routes, gesture guards, release isolation, catalog IDs, geometry, Undo/Redo and portrait layout pass`,
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
  await entry("combine").click();
  assert.equal(await entry("union").getAttribute("aria-disabled"), "true");
  const slots = await dialog
    .locator(".navigator-card")
    .evaluateAll((cards) => cards.map((c) => c.getAttribute("data-entry")));
  await entry("cancel").click();
  await chooseTool(page, "return to modeling", "modeling");
  await browse.click();
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
  assert.equal(await dialog.locator(".navigator-card").count(), 9);
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

async function targetsClearPointer(dialog, pointer) {
  const targets = await dialog.locator(".navigator-target").evaluateAll((elements) =>
    elements.map((element) => {
      const r = element.getBoundingClientRect();
      return {
        x: r.x + r.width / 2,
        y: r.y + r.height / 2,
        radius: r.width / 2,
        visible: getComputedStyle(element).visibility !== "hidden",
      };
    }),
  );
  for (const target of targets) {
    assert.ok(target.visible, "Every tool keeps a visible gesture target at this viewport");
    assert.ok(
      Math.hypot(target.x - pointer.x, target.y - pointer.y) >= target.radius + 10,
      "New targets clear the pointer with a margin",
    );
  }
}

async function tapCategoryClearPointer(dialog, card) {
  const bounds = await card.boundingBox();
  assert.ok(bounds);
  await card.click();
  await targetsClearPointer(dialog, {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  });
}
