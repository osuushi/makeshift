import assert from "node:assert/strict";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { plate } from "./ui-body-fillet.mjs";
import { erosionCapturesRoute } from "./ui-erosion-captures.mjs";
import { accurateErosion } from "./ui-erosion-method.mjs";
import { erosionOptionsRoute } from "./ui-erosion-options.mjs";
import { at, close, drag, inspect } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function select(page, numbers) {
  for (const [i, number] of numbers.entries())
    await page
      .getByRole("button", { name: `Select Body ${number}`, exact: true })
      .click({ modifiers: i ? ["Meta"] : [] });
}
async function cavity(page) {
  await plate(page);
  await chooseTool(page, "select owning bodies", "selection-bodies");
  await accurateErosion(page);
}
async function thickness(page, value) {
  await page.getByRole("textbox", { name: "Erode by", exact: true }).fill(String(value));
  return inspect(page);
}
async function shift(page, value, clearSelection = true) {
  await page.keyboard.press("m");
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  await page.locator(".body-transform-value").fill(String(value));
  await page.keyboard.press("Enter");
  await inspect(page);
  if (clearSelection) await page.keyboard.press("Escape");
}
async function validationRoute(page) {
  await cavity(page);
  const original = (await inspect(page)).document;
  let state = await thickness(page, 1);
  assert.equal(state.interaction.kind, "erode");
  assert.deepEqual(state.document, original);
  close(state.preview.bodies[1].volume, 2592);
  state = await thickness(page, -1);
  assert.equal(state.preview, null);
  assert.equal(await page.getByRole("button", { name: "Accept erosion" }).isEnabled(), false);
  await page.keyboard.press("Enter");
  assert.deepEqual((await inspect(page)).document, original);
  await thickness(page, 1);
  const allowance = page.getByRole("textbox", { name: "Extra thickness allowance", exact: true });
  await allowance.fill("-1");
  assert.equal((await inspect(page)).preview, null);
  await allowance.fill("0");
  close((await inspect(page)).preview.bodies[1].volume, 2592);
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original);
  await accurateErosion(page);
  const handle = page.getByRole("button", { name: "Erosion distance handle" });
  const box = await handle.boundingBox();
  const direction = await handle.evaluate((b) => ({
    x: Number(b.dataset.directionX),
    y: Number(b.dataset.directionY),
  }));
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + direction.x * 18, y + direction.y * 18, { steps: 5 });
  await page.mouse.up();
  state = await inspect(page);
  assert.ok(state.preview?.bodies[1].volume > 0);
  assert.deepEqual(state.document, original);
  await page.keyboard.press("Escape");
  await accurateErosion(page);
  state = await thickness(page, 6);
  assert.equal(state.preview.bodies.length, 1);
  assert.match(await page.locator(".erosion-widget").textContent(), /Empty result/);
  await page.keyboard.press("Enter");
  assert.deepEqual((await inspect(page)).document, original);
  await accurateErosion(page);
  await thickness(page, 1);
  await page.getByRole("textbox", { name: "Erode by", exact: true }).press("Tab");
  await chooseTool(page, "transform", "transform");
  state = await inspect(page);
  assert.equal(state.document.bodies.length, 2);
  assert.equal(state.modelingTool, "move");
}
async function workflow(page, name) {
  await cavity(page);
  const original = (await inspect(page)).document;
  await thickness(page, 1);
  await page.screenshot({ path: `.cache/sketch-review/${name}-erosion-preview.png` });
  await page.getByRole("button", { name: "Accept erosion" }).click();
  let state = await inspect(page);
  const accepted = state.document;
  assert.equal(accepted.bodies.length, 2);
  assert.deepEqual(accepted.bodies[0], original.bodies[0]);
  assert.ok(await page.getByRole("button", { name: "Show Body 1", exact: true }).isVisible());
  assert.deepEqual(state.modelingSelection, [{ kind: "body", body: accepted.bodies[1].id }]);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  assert.ok(await page.getByRole("button", { name: "Hide Body 1", exact: true }).isVisible());
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await select(page, [2]);
  await shift(page, 2, false);
  close((await inspect(page)).document.bodies[1].center[0], 2);
  await chooseTool(page, "undo", "undo");
  await page.waitForFunction(
    () => Math.abs(window.makeshiftInspect().document.bodies[1].center[0]) < 1e-6,
  );
  assert.deepEqual((await inspect(page)).document, accepted);
  await bodyArchiveRoute(page, `${name}-erosion`);
  // Draw and extrude a rib separately, then position it through the cavity.
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [24, -12], [26, 12]);
  const point = await at(page, 25, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(point.x, point.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("10");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  await inspect(page);
  await select(page, [3]);
  await shift(page, -25);
  await select(page, [2, 3]);
  await chooseTool(page, "subtract", "subtract");
  state = await inspect(page);
  assert.equal(state.preview.bodies.length, 3);
  await page.keyboard.press("Enter");
  await inspect(page);
  const labels = await page.getByRole("button", { name: /^Select Body \d+$/ }).allTextContents();
  assert.equal(labels.length, 3);
  const buttons = page.getByRole("button", { name: /^Select Body \d+$/ });
  for (let i = 0; i < 3; i++) await buttons.nth(i).click({ modifiers: i ? ["Meta"] : [] });
  await chooseTool(page, "subtract", "subtract");
  state = await inspect(page);
  assert.equal(state.preview.bodies.length, 1);
  close(state.preview.bodies[0].volume, 1696);
  await page.keyboard.press("Enter");
  close((await inspect(page)).document.bodies[0].volume, 1696);
  await page.screenshot({ path: `.cache/sketch-review/${name}-erosion-rib.png` });
  console.log(
    `${name}: Erode preview, invalid input, drag/cancel, empty result, accept, Undo/Redo, move, Save/Open, cavity rib cut and final subtraction passed`,
  );
}
await withUiRuntimes(
  async (page, name) => {
    await erosionOptionsRoute(page, name);
    await validationRoute(page);
    await workflow(page, name);
    await erosionCapturesRoute(page, name);
  },
  { timeout: 60000 },
);
