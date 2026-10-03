import assert from "node:assert/strict";
import { orient, project } from "./ui-blend-edit.mjs";
import { bodyBooleanRoute, createOperands } from "./ui-body-boolean.mjs";
import { at, close, drag, inspect, reset } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

const keep = (page) => page.getByRole("button", { name: "Keep originals", exact: true });
const body = (page, number) =>
  page.getByRole("button", { name: `Boolean Body ${number}`, exact: true });
async function clear(page) {
  if ((await inspect(page)).modelingSelection.length)
    await chooseTool(page, "clear selection", "selection-clear");
}
async function pick(page, point) {
  const p = await project(page, point);
  await page.mouse.click(p.x, p.y);
  return inspect(page);
}
async function setKeep(page, value) {
  if ((await keep(page).getAttribute("aria-pressed")) !== String(value)) await keep(page).click();
  await inspect(page);
}
async function start(page, mode) {
  await clear(page);
  const state = await inspect(page);
  assert.equal(
    state.commands.find((command) => command.id === mode)?.unavailable,
    null,
    JSON.stringify({
      selection: state.modelingSelection,
      plane: state.activePlane,
      interaction: state.interaction,
    }),
  );
  await chooseTool(page, mode, mode);
  assert.equal((await inspect(page)).interaction.kind, "body-boolean");
}
async function accept(page) {
  await inspect(page);
  await page.keyboard.press("Enter"); // Done choosing
  await page.keyboard.press("Enter"); // Accept
  await page.waitForFunction(() => window.makeshiftInspect().interaction === null);
  return inspect(page);
}
async function toolFirst(page, name) {
  await createOperands(page);
  await orient(page, [0, 0, 1]);
  const original = (await inspect(page)).document;
  for (const mode of ["union", "subtract", "intersect"]) {
    await start(page, mode);
    assert.equal((await inspect(page)).preview, null);
    await setKeep(page, false);
    await pick(page, [-10, 0, 5]);
    assert.equal(await body(page, 1).getAttribute("aria-pressed"), "true");
    assert.equal(await page.getByRole("button", { name: "Accept Boolean" }).isEnabled(), false);
    await pick(page, [-10, 0, 5]);
    assert.equal(await body(page, 1).getAttribute("aria-pressed"), "false");
    await pick(page, [-10, 0, 5]);
    // Reach the portion of the cutter outside the plate by a real viewport click.
    await pick(page, [1, 11, 5]);
    assert.equal(await body(page, 2).getAttribute("aria-pressed"), "true");
    assert.ok((await inspect(page)).preview);
    await accept(page);
    const result = (await inspect(page)).document;
    assert.equal((await inspect(page)).interaction, null);
    assert.notDeepEqual(result, original);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, original);
    await chooseTool(page, "redo", "redo");
    assert.deepEqual((await inspect(page)).document, result);
    await chooseTool(page, "undo", "undo");
  }
  // One preselected body starts collection while preserving its target role.
  await page.getByRole("button", { name: "Select Body 2", exact: true }).click();
  await chooseTool(page, "subtract", "subtract");
  assert.match(await body(page, 2).textContent(), /Target/);
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original);
  await start(page, "union");
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original);
  console.log(
    `${name}: Command-F tool-first pointer add/remove, all modes, one-input route, Undo/Redo/Cancel passed`,
  );
}
async function enclosedOperands(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  const points = [];
  for (const rectangle of [
    [-15, -15, 15, 15],
    [20, -4, 24, 4],
  ]) {
    const [x, y, X, Y] = rectangle;
    await drag(page, [x, y], [X, Y]);
    points.push(await at(page, (x + X) / 2, (y + Y) / 2));
  }
  await chooseTool(page, "return to modeling", "modeling");
  for (const [index, point] of points.entries()) {
    await page.mouse.click(point.x, point.y);
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
    await page.getByRole("textbox", { name: "Extrusion distance" }).fill(index ? "2" : "10");
    await page.keyboard.press("Enter");
    await inspect(page);
    await page.keyboard.press("Enter");
    await inspect(page);
  }
  await orient(page, [1, -1, 1]);
  for (const [axis, value] of [
    ["X", -22],
    ["Z", 4],
  ]) {
    await page.getByRole("button", { name: "Select Body 2", exact: true }).click();
    await page.keyboard.press("m");
    await page.getByRole("button", { name: `Move body ${axis}`, exact: true }).click();
    await page.locator(".body-transform-value").fill(String(value));
    await page.keyboard.press("Enter");
    await inspect(page);
    await page.keyboard.press("Escape");
  }
  await orient(page, [1, -1, 1]);
}
function ghosts(state, target, tool) {
  const operands = state.bodyRendering.booleanOperands;
  for (const [id, role] of [
    [target, "target"],
    [tool, "tool"],
  ]) {
    const surfaces = operands.filter((surface) => surface.body === id);
    assert.ok(
      surfaces.length &&
        surfaces.every(
          (s) =>
            s.role === role && s.triangles > 0 && s.opacity > 0 && s.opacity < 0.3 && !s.depthTest,
        ),
    );
  }
}
async function enclosed(page, name) {
  await enclosedOperands(page);
  const original = (await inspect(page)).document;
  const [target, tool] = original.bodies;
  await start(page, "subtract");
  await setKeep(page, false);
  await body(page, 1).click();
  await body(page, 2).press("Space");
  let state = await inspect(page);
  close(state.preview.bodies[0].volume, target.volume - tool.volume);
  ghosts(state, target.id, tool.id);
  await page.getByRole("button", { name: "Change subtraction target" }).click();
  state = await inspect(page);
  assert.equal(state.preview.bodies.length, 0);
  assert.match(await page.locator(".boolean-status").textContent(), /Empty result/);
  ghosts(state, tool.id, target.id);
  await accept(page);
  assert.equal((await inspect(page)).document.bodies.length, 0);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await start(page, "subtract");
  await body(page, 2).click();
  await body(page, 1).click();
  await inspect(page);
  await page.screenshot({ path: `.cache/sketch-review/${name}-boolean-enclosed-empty.png` });
  await page.getByRole("button", { name: "Change subtraction target" }).click();
  await setKeep(page, true);
  await chooseTool(page, "undo", "undo"); // Restore target order, not the preference.
  await inspect(page);
  assert.equal(await keep(page).getAttribute("aria-pressed"), "true");
  await chooseTool(page, "redo", "redo");
  await inspect(page);
  assert.equal(await keep(page).getAttribute("aria-pressed"), "true");
  await page.getByRole("button", { name: "Union", exact: true }).click();
  await inspect(page);
  assert.equal(await keep(page).getAttribute("aria-pressed"), "false");
  await page.getByRole("button", { name: "Subtract", exact: true }).click();
  await inspect(page);
  assert.equal(await keep(page).getAttribute("aria-pressed"), "true");
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original);
  assert.deepEqual((await inspect(page)).bodyRendering.booleanOperands, []);
  await page.reload();
  await inspect(page);
  await start(page, "subtract");
  assert.equal(await keep(page).getAttribute("aria-pressed"), "true");
  await body(page, 1).click();
  await body(page, 2).click();
  await accept(page);
  const kept = (await inspect(page)).document;
  assert.equal(kept.bodies.length, 2);
  assert.ok(kept.bodies.some((b) => b.id === tool.id));
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, kept);
  await chooseTool(page, "undo", "undo");
  await start(page, "subtract");
  assert.equal(await keep(page).getAttribute("aria-pressed"), "true");
  await setKeep(page, false);
  await body(page, 1).click();
  await body(page, 2).click();
  await accept(page);
  assert.equal((await inspect(page)).document.bodies.length, 1);
  await chooseTool(page, "undo", "undo");
  await page.reload();
  await start(page, "subtract");
  assert.equal(await keep(page).getAttribute("aria-pressed"), "false");
  await page.keyboard.press("Escape");
  console.log(
    `${name}: enclosed surface ghosts, role flip, explicit empty result, keep/remove preference through Cancel/history/reload passed`,
  );
}

await withUiRuntimes(
  async (page, name) => {
    const routes = process.argv.slice(2);
    if (!routes.length || routes.includes("collection")) await toolFirst(page, name);
    if (!routes.length || routes.includes("enclosed")) await enclosed(page, name);
    // This existing selection-first route also covers pointer exit and archive roundtrip.
    if (!routes.length || routes.includes("preselection"))
      await bodyBooleanRoute(page, name, name === "electron");
  },
  { timeout: 30000 },
);
