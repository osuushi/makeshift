import assert from "node:assert/strict";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function menuDiscoveryRoute(page, name) {
  await reset(page);
  const original = await inspect(page);
  await page.keyboard.press("Control+f");
  const input = page.getByRole("combobox", { name: "Find a tool" });
  await page.keyboard.press("ArrowDown");
  assert.equal(
    await page.locator('[aria-selected="true"][role="option"]').getAttribute("data-command"),
    "Solid",
  );
  await page.keyboard.press("Enter");
  await input.fill("rectangle");
  assert.equal(
    await page.locator('[aria-selected="true"][role="option"]').getAttribute("data-command"),
    "rectangle",
    "Search from Solid is global",
  );
  await input.fill("");
  assert.equal(
    await page.locator('[data-command="shell"]').count(),
    1,
    "Clearing returns to Solid",
  );
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  assert.equal(await page.getByRole("option", { name: "Sketch", exact: true }).count(), 1);
  await input.fill("rectangle");
  await page.keyboard.press("Meta+z");
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original.document);
  assert.equal((await inspect(page)).tool, original.tool);
  await page.keyboard.press("Meta+f");
  await input.fill("shell");
  await page.mouse.click(30, 780);
  assert.equal(await page.getByRole("dialog", { name: "Find a tool" }).isVisible(), false);
  assert.deepEqual((await inspect(page)).modelingSelection, original.modelingSelection);
  await page.keyboard.press("Meta+f");
  await page.screenshot({ path: `.cache/sketch-review/${name}-menu-rounded-focus.png` });
  await page.locator(".tool-menu").click({ position: { x: 20, y: 70 } });
  await page.screenshot({ path: `.cache/sketch-review/${name}-menu-rounded-unfocused.png` });
  await page.keyboard.press("Escape");
  console.log(
    `${name}: category keyboard traversal, global search, text history and outside dismissal passed`,
  );
}

export async function menuSketchToolsRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await chooseTool(page, "rectangle", "rectangle");
  await drag(page, [0, 0], [20, 10]);
  await chooseTool(page, "select", "select");
  const corner = await at(page, 0, 0);
  await page.mouse.click(corner.x, corner.y);
  const before = (await inspect(page)).document;
  await page.keyboard.press("Meta+f");
  await page.getByRole("combobox", { name: "Find a tool" }).fill("fillet");
  const rows = page.locator('[role="option"]');
  assert.equal(await rows.first().getAttribute("data-command"), "sketch-fillet");
  assert.equal(await rows.last().getAttribute("data-command"), "fillet");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  assert.deepEqual((await inspect(page)).document, before, "Disabled result cannot execute");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await page.getByRole("textbox", { name: "Fillet radius", exact: true }).fill("2");
  await page.keyboard.press("Enter");
  let sketch = (await inspect(page)).document.sketches[0];
  assert.equal(sketch.curves.length, 5);
  assert.ok(sketch.curves.some((c) => c.kind === "arc"));
  await page.getByRole("textbox", { name: "Radius", exact: true }).fill("3");
  await page.keyboard.press("Enter");
  await chooseTool(page, "undo", "undo");
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "circle", "circle");
  await drag(page, [-20, -10], [-16, -10]);
  await chooseTool(page, "offset sketch", "sketch-offset");
  await page.getByRole("textbox", { name: "Offset distance", exact: true }).fill("1");
  await page.keyboard.press("Enter");
  sketch = (await inspect(page)).document.sketches[0];
  assert.deepEqual(
    sketch.curves.filter((c) => c.kind === "circle").map((c) => c.radius),
    [4, 5],
  );
  await chooseTool(page, "line", "line");
  await drag(page, [-20, 10], [-10, 14]);
  await chooseTool(page, "horizontal", "constraint-horizontal");
  sketch = (await inspect(page)).document.sketches[0];
  const line = sketch.curves.at(-1);
  assert.ok(Math.abs(line.a.y - line.b.y) < 1e-8);
  await chooseTool(page, "lock length", "lock-length");
  assert.ok(
    (await inspect(page)).document.sketches[0].constraints.some(
      (c) => c.kind === "length" && c.curve === line.id,
    ),
  );
  console.log(`${name}: menu sketch fillet/resize/Undo, circle offset and constraint/lock passed`);
}

export async function menuTouchRoute(page, name) {
  await page.setViewportSize({ width: 390, height: 720 });
  try {
    await page.getByRole("button", { name: "More tools", exact: true }).tap();
    await page.getByRole("option", { name: "Reference", exact: true }).tap();
    assert.equal(await page.locator('[data-command="project"]').count(), 1);
    const bounds = await page.locator(".tool-menu").boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390 && bounds.y + bounds.height <= 720);
    await page.screenshot({ path: `.cache/sketch-review/${name}-menu-touch.png` });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "File / Edit", exact: true }).tap();
    const fileMenu = page.getByRole("menu", { name: "File and edit" });
    const fileBounds = await fileMenu.boundingBox();
    assert.ok(fileBounds.x >= 0 && fileBounds.x + fileBounds.width <= 390);
    await page.screenshot({ path: `.cache/sketch-review/${name}-file-menu-touch.png` });
    await fileMenu.locator('[data-command="new"]').tap();
    assert.equal((await inspect(page)).document.sketches.length, 0);
  } finally {
    await page.setViewportSize({ width: 1280, height: 850 });
  }
  console.log(`${name}: narrow touch menu discovery passed`);
}
