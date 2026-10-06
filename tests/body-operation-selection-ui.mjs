import assert from "node:assert/strict";
import { orient, project } from "./ui-blend-edit.mjs";
import { createOperands } from "./ui-body-boolean.mjs";
import { close, inspect, modalCompleted } from "./ui-helpers.mjs";
import { pickPlane } from "./ui-plane-targets.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function clear(page) {
  if ((await inspect(page)).modelingSelection.length)
    await chooseTool(page, "clear selection", "selection-clear");
}
async function pickFace(page, point, add = false) {
  const p = await project(page, point);
  if (add) await page.keyboard.down("Shift");
  await page.mouse.click(p.x, p.y);
  if (add) await page.keyboard.up("Shift");
  const selection = (await inspect(page)).modelingSelection;
  assert.ok(selection.length && selection.every((target) => target.kind === "face"));
  if (add) assert.equal(selection.length, 2);
}
async function selectEdges(page, point) {
  await clear(page);
  await pickFace(page, point);
  await chooseTool(page, "add edges of selected faces", "selection-add-edges");
  await chooseTool(page, "only edges", "selection-only-edges");
  const selection = (await inspect(page)).modelingSelection;
  assert.ok(selection.length && selection.every((target) => target.kind === "edge"));
}
async function booleanRoute(page, original) {
  await clear(page);
  await pickFace(page, [-10, 0, 5]);
  await pickFace(page, [1, 11, 5], true);
  await page.keyboard.press("Shift+s");
  let state = await inspect(page);
  assert.equal(state.interaction.kind, "body-boolean");
  assert.deepEqual(
    state.modelingSelection,
    original.bodies.slice(0, 2).map((body) => ({
      kind: "body",
      body: body.id,
    })),
  );
  const keep = page.getByRole("button", { name: "Keep originals", exact: true });
  if ((await keep.getAttribute("aria-pressed")) === "true") await keep.click();
  state = await inspect(page);
  assert.deepEqual(state.document, original);
  close(
    state.preview.bodies.reduce((sum, body) => sum + body.volume, 0),
    3040,
  );
  await page.getByRole("button", { name: "Accept Boolean", exact: true }).click();
  await modalCompleted(page);
  const accepted = (await inspect(page)).document;
  close(
    accepted.bodies.reduce((sum, body) => sum + body.volume, 0),
    3040,
  );
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await chooseTool(page, "undo", "undo");
  // Edge-only preselection starts collection with its owning body as the target.
  await selectEdges(page, [1, 11, 5]);
  await chooseTool(page, "subtract", "subtract");
  assert.equal((await inspect(page)).preview, null);
  assert.match(
    await page.getByRole("button", { name: "Select Body 2", exact: true }).getAttribute("title"),
    /Target/,
  );
  const p = await project(page, [-10, 0, 5]);
  await page.mouse.click(p.x, p.y);
  assert.ok((await inspect(page)).preview);
  assert.match(
    await page.getByRole("button", { name: "Select Body 1", exact: true }).getAttribute("title"),
    /Target/,
  );
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original);
}
async function bodyTools(page, original) {
  await selectEdges(page, [1, 11, 5]);
  await chooseTool(page, "duplicate bodies", "duplicate");
  assert.deepEqual((await inspect(page)).modelingSelection, [
    { kind: "body", body: original.bodies[1].id },
  ]);
  assert.equal((await inspect(page)).preview.bodies.length, 4);
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  await page.locator(".body-transform-value").fill("7");
  await page.keyboard.press("Enter");
  const duplicated = (await inspect(page)).document;
  const copy = duplicated.bodies.find((body) => !original.bodies.some((b) => b.id === body.id));
  close(copy.volume, original.bodies[1].volume);
  close(copy.center[0], original.bodies[1].center[0] + 7);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await pickFace(page, [-10, 0, 5]);
  await chooseTool(page, "mirror", "mirror");
  await orient(page, [1, 1, 1]);
  await pickPlane(page, "YZ");
  assert.equal((await inspect(page)).preview.bodies.length, 4);
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original);
  await orient(page, [0, 0, 1]);
  await selectEdges(page, [-10, 0, 5]);
  await chooseTool(page, "split body", "split");
  await orient(page, [1, 1, 1]);
  await pickPlane(page, "YZ");
  const split = (await inspect(page)).preview;
  assert.equal(split.bodies.length, 4);
  close(
    split.bodies.reduce((sum, body) => sum + body.volume, 0),
    original.bodies.reduce((sum, body) => sum + body.volume, 0),
  );
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original);
  await orient(page, [0, 0, 1]);
  await clear(page);
  await pickFace(page, [-10, 0, 5]);
  await chooseTool(page, "erode", "erode");
  assert.deepEqual((await inspect(page)).modelingSelection, [
    { kind: "body", body: original.bodies[0].id },
  ]);
  await page
    .getByRole("combobox", { name: "Erosion method", exact: true })
    .selectOption("accurate");
  await page.getByRole("textbox", { name: "Erode by", exact: true }).fill("1");
  assert.ok((await inspect(page)).preview);
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original);
}
await withUiRuntimes(
  async (page, name) => {
    await createOperands(page);
    await orient(page, [0, 0, 1]);
    const original = (await inspect(page)).document;
    await booleanRoute(page, original);
    console.log(`${name}: partial Boolean acceptance, history and operand collection passed`);
    await bodyTools(page, original);
    console.log(`${name}: partial face/edge Boolean, operand order, exact acceptance/history,
    Duplicate movement, Mirror, Split and Erode previews/Cancel passed`);
  },
  { defaults: ["chromium", "webkit"], timeout: 30000 },
);
