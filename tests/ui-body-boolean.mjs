import assert from "node:assert/strict";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { at, close, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function select(page, numbers) {
  for (const [i, number] of numbers.entries())
    await page
      .getByRole("button", { name: `Select Body ${number}`, exact: true })
      .click({ modifiers: i ? ["Meta"] : [] });
}
async function begin(page, operation, numbers) {
  await select(page, numbers);
  await chooseTool(page, operation.toLowerCase(), operation.toLowerCase());
  await inspect(page);
}
async function undo(page) {
  await chooseTool(page, "undo", "undo");
  await inspect(page);
}
export async function createOperands(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  const rectangles = [
    [-15, -10, 15, 10],
    [20, -12, 22, 12],
    [30, -12, 32, 12],
  ];
  const picks = [];
  for (const [x, y, X, Y] of rectangles) {
    await drag(page, [x, y], [X, Y]);
    picks.push(await at(page, (x + X) / 2, (y + Y) / 2));
  }
  await chooseTool(page, "return to modeling", "modeling");
  for (const p of picks) {
    await page.mouse.click(p.x, p.y);
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
    await page.getByRole("textbox", { name: "Extrusion distance" }).fill("5");
    await page.keyboard.press("Enter");
    await inspect(page);
    await page.keyboard.press("Enter");
    await inspect(page);
  }
  for (const [index, shift] of [
    [2, -20],
    [3, -38],
  ]) {
    await select(page, [index]);
    await page.keyboard.press("m");
    await page.getByRole("button", { name: "Move body X", exact: true }).click();
    await page.locator(".body-transform-value").fill(String(shift));
    await page.keyboard.press("Enter");
    await inspect(page);
    await page.keyboard.press("Escape");
  }
}

export async function bodyBooleanRoute(page, name, electron) {
  await createOperands(page);
  const original = (await inspect(page)).document;
  assert.equal(original.bodies.length, 3);
  // Reversed picking order must propose the first picked body, not document order.
  await begin(page, "Subtract", [2, 1]);
  assert.equal(
    await page.getByRole("button", { name: "Select Body 2", exact: true }).getAttribute("title"),
    "Body 2 · Target",
  );
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  let state = await inspect(page);
  assert.equal(state.preview.bodies.length, 3); // two plate pieces plus unselected cutter
  const ghosts = state.bodyRendering.booleanOperands;
  for (const [index, role] of [
    [0, "target"],
    [1, "tool"],
  ]) {
    const surfaces = ghosts.filter((ghost) => ghost.body === original.bodies[index].id);
    assert.ok(
      surfaces.length &&
        surfaces.every((ghost) => ghost.role === role && ghost.triangles > 0 && !ghost.depthTest),
    );
  }
  close(
    state.preview.bodies.reduce((n, b) => n + b.volume, 0),
    3040,
  );
  assert.deepEqual(state.document, original);
  await page.getByRole("button", { name: "Keep originals" }).click();
  state = await inspect(page);
  assert.equal(state.preview.bodies.length, 4);
  await page.screenshot({ path: `.cache/sketch-review/${name}-boolean-subtract.png` });
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original);
  await begin(page, "Subtract", [1, 2, 3]);
  assert.equal(
    await page.getByRole("button", { name: "Keep originals" }).getAttribute("aria-pressed"),
    "true",
  );
  await page.getByRole("button", { name: "Keep originals" }).click();
  state = await inspect(page);
  assert.equal(state.preview.bodies.length, 3);
  close(
    state.preview.bodies.reduce((n, b) => n + b.volume, 0),
    2600,
  );
  const previewVolumes = state.preview.bodies.map((body) => body.volume).sort((a, b) => a - b);
  assert.ok(previewVolumes.every((volume) => volume > 0));
  await page.keyboard.press("Enter");
  const split = (await inspect(page)).document;
  assert.equal(split.bodies.length, 3);
  assert.deepEqual(
    split.bodies.map((body) => body.volume).sort((a, b) => a - b),
    previewVolumes,
  );
  await undo(page);
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, split);
  await undo(page);
  await resultModes(page, original);
  await bodyArchiveRoute(page, `${name}-boolean`, electron);
  console.log(
    `${name}: standalone Boolean preview/split/target reassignment/keep/empty/selection acceptance/history/archive passed`,
  );
}

async function resultModes(page, original) {
  let state;
  await begin(page, "Union", [1, 2]);
  await page.getByRole("button", { name: "Intersect", exact: true }).click();
  state = await inspect(page);
  close(
    state.preview.bodies.reduce((n, b) => n + b.volume, 0),
    440,
  );
  await page.keyboard.press("Enter");
  assert.equal((await inspect(page)).document.bodies.length, 2);
  await undo(page);
  // Intersection of all three is empty, but is a successful, deliberate edit.
  await begin(page, "Intersect", [1, 2, 3]);
  assert.equal(await page.getByRole("button", { name: "Change subtraction target" }).count(), 0);
  assert.match(
    await page.getByRole("button", { name: "Accept Boolean", exact: true }).textContent(),
    /empty result/,
  );
  assert.equal((await inspect(page)).preview.bodies.length, 0);
  await page.keyboard.press("Enter");
  assert.equal((await inspect(page)).document.bodies.length, 0);
  await undo(page);
  // Union with preserved inputs creates independent new identities.
  await begin(page, "Union", [1, 2]);
  await page.getByRole("button", { name: "Keep originals" }).click();
  await inspect(page);
  await page.getByRole("button", { name: "Accept Boolean" }).click();
  state = await inspect(page);
  assert.equal(state.document.bodies.length, 4);
  const ids = state.document.bodies.flatMap((b) => [
    b.id,
    ...b.faces.map((f) => f.id),
    ...b.edges.map((e) => e.id),
  ]);
  assert.equal(new Set(ids).size, ids.length);
  await undo(page);
  // Entity rows edit operands while the tool remains open; Apply accepts explicitly.
  await begin(page, "Union", [1, 2]);
  await page.getByRole("button", { name: "Keep originals" }).click();
  await inspect(page);
  await page.getByRole("button", { name: "Select Body 3", exact: true }).click();
  state = await inspect(page);
  assert.deepEqual(state.document, original);
  assert.equal(state.interaction.kind, "body-boolean");
  assert.equal(
    await page
      .getByRole("button", { name: "Select Body 3", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.getByRole("button", { name: "Accept Boolean", exact: true }).click();
  assert.equal((await inspect(page)).interaction, null);
  await undo(page);
  await begin(page, "Subtract", [1, 2, 3]);
  await page.mouse.click(940, 710); // Empty viewport space does not finish the tool.
  assert.equal((await inspect(page)).interaction.kind, "body-boolean");
  await page.mouse.dblclick(940, 710); // Reference planes cannot steal operand collection.
  state = await inspect(page);
  assert.equal(state.interaction.kind, "body-boolean");
  assert.equal(state.activePlane, null);
  assert.deepEqual(state.document, original);
  await page.keyboard.press("Enter");
  state = await inspect(page);
  assert.equal(state.document.bodies.length, 3);
  assert.equal(state.interaction, null);
}
