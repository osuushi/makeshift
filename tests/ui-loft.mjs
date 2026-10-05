import assert from "node:assert/strict";
import { orient, project } from "./ui-blend-edit.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { at, close, drag, inspect, modalCompleted, reset } from "./ui-helpers.mjs";
import { captureTestFrame } from "./ui-test-frames.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function createSections(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await chooseTool(page, "Toggle grid snapping", "grid");
  assert.equal((await inspect(page)).gridSnap, false);
  for (let index = 0; index < 3; index++) {
    if (index) {
      await page.getByRole("button", { name: `Select Sketch ${index}`, exact: true }).click();
      await chooseTool(page, "New sketch on this plane", "new-sketch-on-plane");
    }
    await page.keyboard.press("r");
    const center = (index - 1) * 12;
    const half = [5, 2, 4][index];
    for (const endpoint of [
      [center - half, -half],
      [center + half, half],
    ]) {
      const client = await at(page, ...endpoint);
      for (const value of [client.x, client.y])
        assert.equal(Number.isInteger(value), true, `Section client ${JSON.stringify(client)}`);
    }
    await drag(page, [center - half, -half], [center + half, half]);
    await chooseTool(page, "return to modeling", "modeling");
  }
  // Draw all fixed sections before orbit can change the in-plane camera target.
  await orient(page, [1, 1, 1]);
  for (const [sketch, distance] of [
    [2, 10],
    [3, 20],
  ]) {
    await page.getByRole("button", { name: `Select Sketch ${sketch}`, exact: true }).click();
    await chooseTool(page, "transform", "transform");
    await page.getByRole("button", { name: "Move sketch Z", exact: true }).click();
    await page.getByRole("textbox", { name: "Translation Z", exact: true }).fill(String(distance));
    await page.keyboard.press("Enter");
    await inspect(page);
    await page.keyboard.press("Escape");
  }
  await page.keyboard.press("Escape");
  await orient(page, [0, 0, 1]);
  return [
    [-12, 0, 0],
    [0, 0, 10],
    [12, 0, 20],
  ];
}
function assertSectionSeeds(document) {
  assert.equal(document.sketches.length, 3);
  const seeds = [
    { center: -12, size: 10, z: 0 },
    { center: 0, size: 4, z: 10 },
    { center: 12, size: 8, z: 20 },
  ];
  for (const [index, { center, size, z }] of seeds.entries()) {
    const sketch = document.sketches[index];
    for (const [axis, expected] of Object.entries({
      origin: [0, 0, z],
      u: [1, 0, 0],
      v: [0, 1, 0],
    }))
      for (const [component, value] of expected.entries())
        close(sketch.plane[axis][component], value, `Section ${index + 1} ${axis} ${component}`);
    assert.equal(sketch.curves.length, 4);
    const half = size / 2;
    const vertices = [
      [center - half, -half],
      [center + half, -half],
      [center + half, half],
      [center - half, half],
    ];
    for (const [edge, curve] of sketch.curves.entries()) {
      assert.equal(curve.kind, "segment");
      for (const [endpoint, expected] of [
        [curve.a, vertices[edge]],
        [curve.b, vertices[(edge + 1) % 4]],
      ]) {
        close(endpoint.x, expected[0], `Section ${index + 1} X`);
        close(endpoint.y, expected[1], `Section ${index + 1} Y`);
      }
    }
  }
}
async function select(page, point, shift = false) {
  const p = await project(page, point);
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.click(p.x, p.y);
  if (shift) await page.keyboard.up("Shift");
  await inspect(page);
}
export async function loftRoute(page, name, start = (page) => chooseTool(page, "loft", "loft")) {
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 1280, height: 800 });
  try {
    const points = await createSections(page);
    const original = (await inspect(page)).document;
    assertSectionSeeds(original);
    // Start with no selection and collect by actual viewport clicks, in reverse order.
    await start(page);
    assert.equal((await inspect(page)).interaction.kind, "loft");
    await select(page, points[2]);
    assert.equal(
      await page.getByRole("button", { name: "Accept loft", exact: true }).isEnabled(),
      false,
    );
    await select(page, points[1]);
    await select(page, points[0]);
    let state = await inspect(page);
    assert.ok(state.preview?.bodies?.length);
    assert.deepEqual(state.document, original);
    assert.equal(await page.locator(".loft-controls li").count(), 3);
    await page.getByRole("button", { name: "Add loft sections", exact: true }).click();
    await page.getByRole("combobox", { name: "Loft shape", exact: true }).selectOption("ruled");
    state = await inspect(page);
    const ruledVolume = (10 / 3) * (100 + 40 + 16 + 16 + 32 + 64);
    assert.ok(Math.abs(state.preview.bodies[0].volume - ruledVolume) < 1e-5);
    await page.getByRole("combobox", { name: "Loft shape", exact: true }).selectOption("smooth");
    state = await inspect(page);
    assert.ok(Math.abs(state.preview.bodies[0].volume - ruledVolume) > 1);
    await modeRecovery(page, original);
    await page.getByRole("button", { name: "Next alignment 2", exact: true }).click();
    await inspect(page);
    await page.getByRole("button", { name: "Reset loft alignment", exact: true }).click();
    await inspect(page);
    await page.getByRole("button", { name: "Move section up 3", exact: true }).click();
    await inspect(page);
    await page.getByRole("button", { name: "Move section down 2", exact: true }).click();
    await inspect(page);
    await page.getByRole("button", { name: "Remove section 2", exact: true }).click();
    await inspect(page);
    await page.getByRole("button", { name: "Remove section 2", exact: true }).click();
    state = await inspect(page);
    assert.equal(
      await page.getByRole("button", { name: "Accept loft", exact: true }).isEnabled(),
      false,
    );
    assert.deepEqual(state.document, original);
    await page.keyboard.press("Escape");
    await modalCompleted(page);
    assert.equal((await inspect(page)).preview, null);
    await acceptPreselection(page, points, original, ruledVolume, name, start);
  } finally {
    await page.setViewportSize(viewport);
  }
}
async function acceptPreselection(page, points, original, ruledVolume, name, start) {
  // Ordered preselection remains the other ordinary entry route.
  await select(page, points[2]);
  await select(page, points[1], true);
  await select(page, points[0], true);
  assert.equal((await inspect(page)).modelingSelection.length, 3);
  await start(page);
  await page.getByRole("combobox", { name: "Loft shape", exact: true }).selectOption("ruled");
  await inspect(page);
  await orient(page, [1, 1, 1]);
  await captureTestFrame(page);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await retainedCanvasFrame(page);
  await page.screenshot({ path: `.cache/sketch-review/${name}-loft-preview.png` });

  await page.getByRole("button", { name: "Accept loft", exact: true }).click();
  await modalCompleted(page);
  let state = await inspect(page);
  assert.equal(state.document.bodies.length, 1);
  assert.ok(Math.abs(state.document.bodies[0].volume - ruledVolume) < 1e-5);
  assert.equal(state.interaction, null);
  const accepted = state.document;
  for (let i = 1; i <= 3; i++)
    assert.equal(
      await page.getByRole("button", { name: `Show Sketch ${i}`, exact: true }).count(),
      1,
    );
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  state = await inspect(page);
  for (let i = 1; i <= 3; i++)
    assert.equal(
      await page.getByRole("button", { name: `Hide Sketch ${i}`, exact: true }).count(),
      1,
    );
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await chooseTool(page, "transform", "transform");
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  await page.locator(".body-transform-value").fill("3");
  await page.keyboard.press("Enter");
  state = await inspect(page);
  assert.ok(Math.abs(state.document.bodies[0].center[0] - accepted.bodies[0].center[0] - 3) < 1e-5);
  await bodyArchiveRoute(page, `${name}-loft`);
  await deleteAndClear(page);
  console.log(
    `${name}: ordered loft collection/preselection, Smooth/Ruled, seams, reorder/remove, cancel, accept, Undo/Redo, movement, archive and Delete/Clear passed`,
  );
}

async function deleteAndClear(page) {
  const original = (await inspect(page)).document;
  await page.getByRole("button", { name: "Select Sketch 1", exact: true }).click();
  await page.keyboard.press("Backspace");
  let state = await inspect(page);
  assert.equal(state.document.sketches.length, original.sketches.length - 1);
  assert.deepEqual(state.document.bodies, original.bodies);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await page.keyboard.press("Delete");
  state = await inspect(page);
  assert.deepEqual(state.document.bodies, []);
  assert.deepEqual(state.document.sketches, original.sketches);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await page.getByRole("button", { name: "Select Sketch 1", exact: true }).click();
  await chooseTool(page, "edit sketch", "edit-sketch");
  // Complete workspace navigation before asserting a single geometry Undo.
  await page.waitForFunction(() => {
    const state = window.makeshiftInspect();
    return !state.camera.moving && !state.camera.navigationPending;
  });
  await chooseTool(page, "clear sketch", "clear-sketch");
  state = await inspect(page);
  assert.equal(state.document.sketches[0].curves.length, 0);
  assert.deepEqual(state.document.bodies, original.bodies);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
}

async function modeRecovery(page, original) {
  await page.getByRole("button", { name: "New body", exact: true }).click();
  const valid = (await inspect(page)).preview;
  assert.ok(valid);
  await page.getByRole("button", { name: "Subtract", exact: true }).click();
  const failed = await inspect(page);
  assert.deepEqual(failed.document, original);
  assert.deepEqual(failed.preview, valid, "Failed mode retains the last valid presentation");
  assert.equal(
    await page.getByRole("button", { name: "Accept loft", exact: true }).isEnabled(),
    false,
  );
  await page.getByRole("button", { name: "Union", exact: true }).click();
  await inspect(page);
  assert.equal(
    await page.getByRole("button", { name: "Accept loft", exact: true }).isEnabled(),
    true,
  );
}

async function retainedCanvasFrame(page) {
  const colors = await page.evaluate(() => {
    const copy = document.createElement("canvas");
    copy.width = copy.height = 64;
    const context = copy.getContext("2d");
    context.drawImage(document.querySelector("canvas"), 0, 0, 64, 64);
    const pixels = context.getImageData(0, 0, 64, 64).data;
    const values = new Set();
    for (let i = 0; i < pixels.length; i += 4)
      values.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
    return values.size;
  });
  assert.ok(colors > 4, "The retained viewport frame must remain capturable between redraws");
}
