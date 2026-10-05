import assert from "node:assert/strict";
import { historyMenu } from "./native-documents.mjs";
import { plate } from "./ui-body-fillet.mjs";
import { at, close, drag, inspect, reset } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function history(page, redo = false, menu = false) {
  const direction = redo ? "redo" : "undo";
  await page.waitForFunction(
    (direction) =>
      window.makeshiftInspect().commands.find((command) => command.id === direction)
        ?.unavailable === null,
    direction,
  );
  if (menu) await historyMenu(page, direction);
  else await chooseTool(page, direction, direction);
  return inspect(page);
}
async function checkpoint(page, input, value) {
  await input.fill(String(value));
  await inspect(page);
  await page.getByRole("button", { name: "Tools", exact: true }).focus();
  return inspect(page);
}
const applied = async (page) =>
  page.evaluate(async () =>
    (await window.makeshiftHistory())
      .filter((entry) => entry.state === "applied")
      .map((entry) => entry.id),
  );

async function exitAtBaseline(page, original, menu = false) {
  const before = await applied(page);
  const state = await history(page, false, menu);
  assert.equal(state.interaction, null, "Initial modal Undo exits the tool");
  assert.equal(state.preview, null);
  assert.deepEqual(state.document, original, "Exit neither accepts nor undoes geometry");
  const afterExit = await applied(page);
  assert.deepEqual(
    afterExit.filter((id) => before.includes(id)),
    before,
    "That press does not also navigate document history",
  );
  const newKinds = await page.evaluate(
    async (before) =>
      (await window.makeshiftHistory())
        .filter((entry) => entry.state === "applied" && !before.includes(entry.id))
        .map((entry) => entry.operation.kind),
    before,
  );
  assert.ok(
    newKinds.every((kind) => kind === "selection"),
    "Cancellation may restore its expanded selection only",
  );
  await history(page);
  assert.deepEqual(
    await applied(page),
    afterExit.slice(0, -1),
    "Next Undo navigates ordinary history",
  );
  await history(page, true);
  assert.deepEqual((await inspect(page)).document, original);
}

async function filletBoundary(page) {
  await plate(page);
  const original = (await inspect(page)).document;
  const start = page.getByRole("button", { name: "Fillet edges", exact: true });
  await start.click();
  const radius = page.getByRole("textbox", { name: "Fillet radius", exact: true });
  const first = await checkpoint(page, radius, 1);
  assert.ok(first.preview.bodies[0].volume < 4000);
  await checkpoint(page, radius, 2);
  let state = await history(page);
  close(state.preview.bodies[0].volume, first.preview.bodies[0].volume);
  state = await history(page);
  assert.equal(state.interaction.kind, "body-edge-finish");
  assert.equal(await radius.inputValue(), "0");
  close(state.preview.bodies[0].volume, 4000, "Zero-radius preview restores the unmodified solid");
  assert.deepEqual(state.document, original);
  state = await history(page, true);
  close(state.preview.bodies[0].volume, first.preview.bodies[0].volume);
  await history(page);
  await exitAtBaseline(page, original, true);
  // Starting an unchanged modal tool also exits on its first Undo press.
  await start.click();
  await exitAtBaseline(page, original);
}

async function extrusionBoundary(page) {
  const { center } = await plate(page);
  await page.mouse.click(center.x + 30, center.y + 30);
  const original = (await inspect(page)).document;
  await page.keyboard.press("e");
  const distance = page.getByRole("textbox", { name: "Extrusion distance", exact: true });
  const first = await checkpoint(page, distance, 2);
  close(first.preview.bodies[0].volume, 4800);
  await checkpoint(page, distance, 4);
  let state = await history(page);
  close(state.preview.bodies[0].volume, 4800);
  state = await history(page);
  assert.equal(state.interaction.kind, "extrude");
  assert.equal(state.preview, null);
  state = await history(page, true);
  close(state.preview.bodies[0].volume, 4800);
  await history(page);
  await exitAtBaseline(page, original);
  await page.keyboard.press("e");
  await checkpoint(page, distance, 3);
  await page.keyboard.press("Escape");
  assert.equal((await inspect(page)).interaction, null);
  assert.deepEqual(
    (await inspect(page)).document,
    original,
    "Escape retains ordinary cancellation",
  );
}

async function booleanBoundary(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-20, -10], [-10, 10]);
  await drag(page, [10, -10], [20, 10]);
  const left = await at(page, -15, 3),
    right = await at(page, 15, 3);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(left.x, left.y);
  await page.keyboard.down("Shift");
  await page.mouse.click(right.x, right.y);
  await page.keyboard.up("Shift");
  assert.equal((await inspect(page)).modelingSelection.length, 2);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await checkpoint(page, page.getByRole("textbox", { name: "Extrusion distance", exact: true }), 5);
  assert.equal((await inspect(page)).preview.bodies.length, 2);
  await page.keyboard.press("Enter");
  assert.equal((await inspect(page)).document.bodies.length, 2);
  for (const [index, number] of [1, 2].entries())
    await page
      .getByRole("button", { name: `Select Body ${number}`, exact: true })
      .click({ modifiers: index ? ["Meta"] : [] });
  const original = (await inspect(page)).document;
  await chooseTool(page, "union", "union");
  assert.equal((await inspect(page)).preview.bodies.length, 2);
  const keep = page.getByRole("button", { name: "Keep originals", exact: true });
  await keep.click();
  assert.equal((await inspect(page)).preview.bodies.length, 4);
  const second = page.getByRole("button", { name: "Select Body 2", exact: true });
  await second.click();
  assert.equal((await inspect(page)).preview, null, "One operand cannot produce a Boolean");
  await history(page);
  assert.equal(await second.getAttribute("aria-pressed"), "true");
  assert.equal((await inspect(page)).preview.bodies.length, 4);
  assert.equal(await keep.getAttribute("aria-pressed"), "true", "Preferences stay outside Undo");
  await history(page, true);
  assert.equal(await second.getAttribute("aria-pressed"), "false");
  assert.equal((await inspect(page)).preview, null);
  await history(page);
  assert.equal((await inspect(page)).interaction.kind, "body-boolean");
  assert.equal(
    (await inspect(page)).preview.bodies.length,
    4,
    "Initial Boolean retains a valid preview and its explicit preference",
  );
  await exitAtBaseline(page, original, true);
}

await withUiRuntimes(
  async (page, name) => {
    await filletBoundary(page);
    console.log(`${name}: Fillet initial Undo exit and local checkpoints passed`);
    await extrusionBoundary(page);
    console.log(`${name}: Extrude initial Undo exit and local checkpoints passed`);
    await booleanBoundary(page);
    console.log(
      `${name}: initial modal Undo exits Fillet/Extrude/Boolean without geometry acceptance; local redo, next document Undo, menus and Escape passed`,
    );
  },
  { timeout: 30000 },
);
