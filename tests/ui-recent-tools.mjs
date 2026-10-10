import assert from "node:assert/strict";
import { worldClick } from "./ui-face-offset.mjs";
import { at, close, drag, inspect, settled } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const categoryIds = [
  "Sketch",
  "Solid",
  "Transform",
  "Constrain",
  "Reference",
  "Select",
  "View",
  "Document & Edit",
  "Development",
];
const search = (page) => page.getByRole("combobox", { name: "Find a tool" });
async function commandIdle(page) {
  await page.waitForFunction(
    () =>
      !window
        .makeshiftInspect()
        .commands.some((command) => command.unavailable === "Switching tools…"),
  );
}
export async function recentIds(page) {
  await commandIdle(page);
  await page.keyboard.press("Meta+f");
  await search(page).fill("");
  const ids = await page
    .locator("#tool-results > button")
    .evaluateAll((rows) => rows.map((row) => row.dataset.command));
  return ids.filter((id) => !categoryIds.includes(id));
}
async function dismissed(page) {
  await page.keyboard.press("Escape");
}
async function shortcut(page, key) {
  await page.getByRole("button", { name: "More tools", exact: true }).focus();
  await page.keyboard.press(key);
  await settled(page);
}
export async function recentDiscoveryRoute(page, name) {
  await inspect(page);
  assert.deepEqual(await recentIds(page), []);
  await dismissed(page);
  const expected = [];
  for (const id of [
    "rectangle",
    "line",
    "circle",
    "bezier",
    "trim",
    "select",
    "grid",
    "sketch-xy",
    "sketch-xz",
    "sketch-yz",
    "modeling",
  ]) {
    await chooseTool(page, id, id);
    expected.unshift(id);
    expected.splice(10);
    assert.deepEqual(await recentIds(page), expected);
    await dismissed(page);
  }
  // L owns Loft in idle Modeling; explicitly enter Sketch before promoting Line.
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  expected.splice(0, expected.length, "sketch-xy", ...expected.filter((id) => id !== "sketch-xy"));
  assert.deepEqual(await recentIds(page), expected);
  await dismissed(page);
  await shortcut(page, "l");
  assert.deepEqual(await recentIds(page), ["line", ...expected.filter((id) => id !== "line")]);
  await page.locator('[data-command="circle"]').click();
  assert.deepEqual(
    await recentIds(page),
    ["circle", "line", ...expected.filter((id) => !["circle", "line"].includes(id))],
    "Pointer activation of an older recent tool promotes it",
  );
  const before = await inspect(page);
  await page.keyboard.press("ArrowRight");
  assert.equal(
    await page.getByRole("dialog", { name: "Find a tool" }).isVisible(),
    true,
    "Right only opens categories",
  );
  assert.equal((await inspect(page)).tool, before.tool);
  await search(page).fill("rect");
  assert.equal(
    await page.locator('[aria-selected="true"][role="option"]').getAttribute("data-command"),
    "rectangle",
  );
  await search(page).fill("");
  const categories = await page
    .locator("#tool-results > button")
    .evaluateAll((rows) => rows.map((row) => row.dataset.command));
  assert.deepEqual(
    categories.filter((id) => categoryIds.includes(id)),
    categoryIds,
  );
  await page.getByRole("option", { name: "Solid", exact: true }).click();
  assert.equal(await page.locator('[data-command="shell"]').getAttribute("aria-disabled"), "true");
  await search(page).fill("rectangle");
  await page.keyboard.press("Enter");
  assert.equal((await inspect(page)).tool, "rectangle");
  const afterSearch = await recentIds(page);
  assert.equal(afterSearch[0], "rectangle");
  await windowLifetime(page, name, afterSearch);
  console.log(
    `${name}: recent cap, repeated keyboard/menu promotion, fixed categories/search and window lifetime passed`,
  );
}
async function windowLifetime(page, name, afterSearch) {
  await dismissed(page);
  const beforeNew = await inspect(page);
  await chooseTool(page, "new document", "new");
  await page.waitForFunction(
    () =>
      !window
        .makeshiftInspect()
        .commands.some((command) => command.unavailable === "Switching tools…") ||
      !!document.querySelector('dialog[aria-label="Unsaved changes"][open]'),
  );
  const discard = page
    .getByRole("dialog", { name: "Unsaved changes" })
    .getByRole("button", { name: "Don’t Save", exact: true });
  const confirmation = await discard.isVisible();
  if (process.env.MAKESHIFT_RECENT_DIAGNOSTICS)
    console.log(name, "recent New", {
      sketches: beforeNew.document.sketches.map((sketch) => sketch.curves.length),
      interaction: beforeNew.interaction,
      confirmation,
    });
  if (confirmation) await discard.click();
  assert.deepEqual(
    await recentIds(page),
    afterSearch,
    "New is hidden and recency remains window-local",
  );
  await dismissed(page);
  await page.reload();
  await inspect(page);
  assert.deepEqual(await recentIds(page), [], "Reload starts a new window UI catalog");
  await dismissed(page);
}
export async function recentSketchRoute(page, name) {
  await chooseTool(page, "rectangle", "rectangle");
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  assert.deepEqual(await recentIds(page), ["sketch-xy", "rectangle"]);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await drag(page, [-10, -10], [10, 10]);
  let state = await inspect(page);
  assert.equal(state.document.sketches[0].curves.length, 4);
  const width = page.getByRole("textbox", { name: "Width", exact: true });
  await width.fill("24");
  const before = await inspect(page);
  const recents = await recentIds(page);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  assert.equal(await width.inputValue(), "24");
  assert.equal(await width.evaluate((field) => field === document.activeElement), true);
  state = await inspect(page);
  for (const key of ["document", "selectionTargets", "modelingSelection", "interaction", "preview"])
    assert.deepEqual(state[key], before[key], `Recent dismissal preserves ${key}`);
  await page.keyboard.press("Enter");
  await chooseTool(page, "undo", "undo");
  await commandIdle(page);
  assert.deepEqual((await inspect(page)).document, before.document);
  assert.deepEqual(await recentIds(page), recents, "Standard Undo does not promote");
  await dismissed(page);
  await chooseTool(page, "select", "select");
  const edge = await at(page, -10, 3);
  await page.mouse.click(edge.x, edge.y);
  const selection = (await inspect(page)).selectionTargets;
  await recentIds(page);
  await page.mouse.click(30, 780);
  assert.deepEqual(
    (await inspect(page)).selectionTargets,
    selection,
    "Outside recent dismissal consumes geometry click",
  );
  await chooseTool(page, "return to modeling", "modeling");
  await page.getByRole("button", { name: "Select Sketch 1", exact: true }).click();
  await page.keyboard.press("Enter");
  assert.equal((await inspect(page)).activePlane, "Sketch 1");
  assert.equal(
    (await recentIds(page))[0],
    "edit-sketch",
    "Ordinary sketch Enter shares invocation route",
  );
  await dismissed(page);
  console.log(
    `${name}: Recent keyboard Rectangle creates geometry; numeric/selection dismissal, Undo and sketch Enter passed`,
  );
}
export async function recentSolidRoute(page, name) {
  const center = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  await shortcut(page, "e");
  assert.equal((await recentIds(page))[0], "extrude", "Solid shortcut promotes");
  await dismissed(page);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  const distance = page.getByRole("textbox", { name: "Extrusion distance", exact: true });
  await distance.fill("10");
  await inspect(page);
  await page.getByRole("button", { name: "Accept extrusion", exact: true }).click();
  close((await inspect(page)).document.bodies[0].volume, 4000);
  await worldClick(page, [4, 4, 10]);
  await chooseTool(page, "thickness", "shell");
  const thickness = page.getByRole("textbox", { name: "Shell thickness", exact: true });
  await thickness.fill("-30");
  await inspect(page);
  const before = await inspect(page);
  const recent = await recentIds(page);
  await search(page).fill("transform");
  await page.locator('[data-command="transform"]').click();
  const switched = await inspect(page);
  assert.equal(switched.interaction, null);
  assert.deepEqual(switched.document, before.document);
  assert.deepEqual(
    await recentIds(page),
    ["transform", ...recent.filter((id) => id !== "transform")],
    "Admitted switch cancels invalid Shell and promotes Transform",
  );
  await dismissed(page);
  await chooseTool(page, "thickness", "shell");
  await thickness.fill("-1");
  await inspect(page);
  await page.getByRole("button", { name: "Accept shell", exact: true }).click();
  const afterAcceptClick = await page.evaluate(() => {
    const state = window.makeshiftInspect();
    return { interaction: state.interaction, selection: state.modelingSelection, busy: state.busy };
  });
  await page.waitForFunction(
    () => !window.makeshiftInspect().busy && window.makeshiftInspect().interaction === null,
  );
  await commandIdle(page);
  const afterAccept = await inspect(page);
  close(afterAccept.document.bodies[0].volume, 1084, "Accepted open-top shell volume");
  await page.getByLabel("Modeling viewport", { exact: true }).focus();
  await page.keyboard.press("Escape");
  const accepted = await inspect(page);
  if (process.env.MAKESHIFT_RECENT_DIAGNOSTICS)
    console.log(name, "Shell accepted/Escape", {
      afterAcceptClick,
      afterAccept: {
        interaction: afterAccept.interaction,
        selection: afterAccept.modelingSelection,
      },
      afterEscape: { interaction: accepted.interaction, selection: accepted.modelingSelection },
    });
  assert.deepEqual(
    accepted.modelingSelection,
    [],
    "Escape clears the accepted operation selection",
  );
  const ids = await recentIds(page);
  const shell = page.locator('[data-command="shell"]');
  assert.equal(await shell.getAttribute("aria-disabled"), "true");
  assert.match(await shell.textContent(), /Select a body or faces/);
  // Disabled recent remains keyboard-inspectable at its chronological position.
  for (let index = 0; index < ids.indexOf("shell"); index++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  assert.equal(await page.getByRole("dialog", { name: "Find a tool" }).isVisible(), true);
  await dismissed(page);
  assert.deepEqual((await inspect(page)).document, accepted.document);
  assert.deepEqual(await recentIds(page), ids);
  await dismissed(page);
  await page.screenshot({ path: `.cache/sketch-review/${name}-recent-tools.png` });
  console.log(
    `${name}: real Extrude/Shell geometry, invalid modal cancellation and disabled Recent invocation passed`,
  );
}
