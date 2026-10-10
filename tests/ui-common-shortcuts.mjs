import assert from "node:assert/strict";
import { orient, project } from "./ui-blend-edit.mjs";
import { createOperands } from "./ui-body-boolean.mjs";
import { plate } from "./ui-body-fillet.mjs";
import { close, inspect, modalCompleted } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export const commonKeys = ["Shift+U", "Shift+S", "Shift+I", "l"];
export async function keyTool(page, key) {
  await page.getByRole("button", { name: "More tools", exact: true }).focus();
  await page.keyboard.press(key);
  return inspect(page);
}
async function clear(page) {
  if ((await inspect(page)).modelingSelection.length)
    await chooseTool(page, "clear selection", "selection-clear");
}
async function removeOriginals(page) {
  const keep = page.getByRole("button", { name: "Keep originals", exact: true });
  if ((await keep.getAttribute("aria-pressed")) === "true") await keep.click();
  await inspect(page);
}
async function history(page, original) {
  const accepted = (await inspect(page)).document;
  assert.notDeepEqual(accepted, original);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
}
async function previewVolume(page, expected) {
  const state = await inspect(page);
  assert.equal(state.interaction.kind, "body-boolean");
  close(
    state.preview.bodies.reduce((sum, body) => sum + body.volume, 0),
    expected,
  );
}
export async function shortcutBooleans(page, name) {
  await createOperands(page);
  await orient(page, [0, 0, 1]);
  const original = (await inspect(page)).document;
  // Body 1: 3000 mm3. Body 2: 240 mm3, overlaps by 200. Body 3 stays untouched: 240.
  for (const [mode, key, expected] of [
    ["union", "Shift+U", 3280],
    ["subtract", "Shift+S", 3040],
    ["intersect", "Shift+I", 440],
  ]) {
    await clear(page);
    await keyTool(page, key);
    assert.equal((await inspect(page)).interaction.kind, "body-boolean");
    assert.equal((await inspect(page)).preview, null);
    await removeOriginals(page);
    // A new Subtract target demotes the previous target to a cutting tool.
    const points =
      mode === "subtract"
        ? [
            [1, 11, 5],
            [-10, 0, 5],
          ]
        : [
            [-10, 0, 5],
            [1, 11, 5],
          ];
    for (const point of points) {
      const p = await project(page, point);
      await page.mouse.click(p.x, p.y);
      await inspect(page);
    }
    if (mode === "subtract")
      assert.equal(
        await page
          .getByRole("button", { name: "Select Body 1", exact: true })
          .getAttribute("title"),
        "Body 1 · Target",
      );
    await previewVolume(page, expected);
    await page.keyboard.press("Enter"); // Apply the current operands.
    await modalCompleted(page);
    await inspect(page);
    await history(page, original);
    await clear(page);
    for (const number of [1, 2])
      await page
        .getByRole("button", { name: `Select Body ${number}`, exact: true })
        .click({ modifiers: number === 2 ? ["Meta"] : [] });
    await keyTool(page, key);
    await removeOriginals(page);
    await previewVolume(page, expected);
    await page.keyboard.press("Enter");
    await modalCompleted(page);
    await inspect(page);
    await history(page, original);
    console.log(
      `${name}: ${mode} shortcut collection/preselection, exact volume and Undo/Redo passed`,
    );
  }
  await clear(page);
  await page.getByRole("button", { name: "Select Body 2", exact: true }).click();
  await keyTool(page, "Shift+S");
  assert.equal(
    await page.getByRole("button", { name: "Select Body 2", exact: true }).getAttribute("title"),
    "Body 2 · Target",
  );
  await page.keyboard.press("Escape");
  await modalCompleted(page);
  assert.deepEqual((await inspect(page)).document, original);
}
export async function toolsErode(page, name) {
  await plate(page);
  await chooseTool(page, "select owning bodies", "selection-bodies");
  const original = (await inspect(page)).document;
  close(original.bodies[0].volume, 4000);
  const idle = await inspect(page);
  await keyTool(page, "Shift+E");
  const unchanged = await inspect(page);
  assert.equal(unchanged.interaction, null);
  assert.equal(unchanged.modelingTool, idle.modelingTool);
  assert.deepEqual(unchanged.document, original);
  await chooseTool(page, "Erode", "erode");
  assert.equal((await inspect(page)).modelingTool, "erode");
  await page
    .getByRole("combobox", { name: "Erosion method", exact: true })
    .selectOption("accurate");
  const thickness = page.getByRole("textbox", { name: "Erode by", exact: true });
  const allowance = page.getByRole("textbox", { name: "Extra thickness allowance", exact: true });
  await allowance.fill("0");
  await removeOriginals(page);
  await inspect(page);
  close((await inspect(page)).preview.bodies[0].volume, 18 * 18 * 8);
  await thickness.fill("2");
  await inspect(page);
  close((await inspect(page)).preview.bodies[0].volume, 16 * 16 * 6);
  await page.getByRole("button", { name: "Accept erosion", exact: true }).click();
  await modalCompleted(page);
  close((await inspect(page)).document.bodies[0].volume, 16 * 16 * 6);
  await history(page, original);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await chooseTool(page, "Erode", "erode");
  await inspect(page);
  assert.equal(await thickness.inputValue(), "1");
  await page.keyboard.press("Escape");
  await modalCompleted(page);
  assert.deepEqual((await inspect(page)).document, original);
  console.log(
    `${name}: Erode through Tools, unassigned Shift-E, Analytic fields, exact volume, reselection/cancel and Undo/Redo passed`,
  );
}
