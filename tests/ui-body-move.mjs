import assert from "node:assert/strict";
import { groupDragAndSketch, topProjection } from "./ui-body-group-move.mjs";
import { at, close, drag, inspect, reset } from "./ui-helpers.mjs";
import { browseTools, chooseTool } from "./ui-tools.mjs";

async function quantity(page, label, value) {
  await page.getByRole("button", { name: label, exact: true }).click();
  const input = page.locator(".body-transform-value");
  await input.fill(String(value));
  await page.keyboard.press("Enter");
  await inspect(page);
}
export async function bodyMoveRoute(page, name) {
  const viewport =
    page.viewportSize() ??
    (await page.evaluate(() => ({ width: innerWidth, height: innerHeight })));
  // The exact box fixture uses grid-off input: choose integer CSS pixels per mm.
  await page.setViewportSize({ width: 1280, height: 800 });
  try {
    await bodyMoveAtAlignedViewport(page, name);
  } finally {
    await page.setViewportSize(viewport);
  }
}
async function bodyMoveAtAlignedViewport(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  if (String((await inspect(page)).gridSnap) === "true")
    await chooseTool(page, "grid snap", "grid");
  await page.keyboard.press("r");
  await drag(page, [-10, -5], [10, 5]);
  const pick = await at(page, 3, 2);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(pick.x, pick.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("5");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  const original = (await inspect(page)).document;
  await page.mouse.click(pick.x, pick.y);
  await browseTools(page, "Select");
  await chooseTool(page, "select owning bodies", "selection-bodies");
  await page.keyboard.press("m");
  await quantity(page, "Move body X", 10);
  await assertDefaultAnchor(page);
  await chooseTool(page, "undo", "undo");
  await inspect(page);
  await assertDefaultAnchor(page);
  await chooseTool(page, "redo", "redo");
  await inspect(page);
  await assertDefaultAnchor(page);
  let state = await inspect(page),
    body = state.document.bodies[0];
  close(body.center[0], 10);
  close(body.volume, 1000);
  assert.equal(body.id, original.bodies[0].id);
  assert.deepEqual(
    body.faces.map((f) => f.id).sort(),
    original.bodies[0].faces.map((f) => f.id).sort(),
  );
  assert.deepEqual(
    body.edges.map((f) => f.id).sort(),
    original.bodies[0].edges.map((f) => f.id).sort(),
  );
  assert.deepEqual(state.document.sketches, original.sketches);
  await page.getByRole("button", { name: "Reposition body pivot", exact: true }).click();
  await quantity(page, "Move body X", -10);
  assert.deepEqual((await inspect(page)).document.bodies, [body]);
  await page.getByRole("button", { name: "Reposition body pivot", exact: true }).click();
  await page.getByRole("button", { name: "Rotate layer", exact: true }).click();
  await quantity(page, "Rotate body Z", 90);
  body = (await inspect(page)).document.bodies[0];
  close(body.center[0], 0);
  close(body.center[1], 10);
  await duplicateAndUndo(page, body);
  await groupDragAndSketch(page);
  await page.screenshot({ path: `.cache/sketch-review/${name}-body-move.png` });
  console.log(
    `${name}: exact body moves, pivot rotation, duplicate identities, multibody drag, cancellation/history and face sketch passed`,
  );
}

async function duplicateAndUndo(page, body) {
  await chooseTool(page, "duplicate bodies", "duplicate");
  assert.equal((await inspect(page)).document.bodies.length, 1);
  assert.equal((await inspect(page)).preview.bodies.length, 2);
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  assert.equal((await inspect(page)).document.bodies.length, 1);
  assert.equal((await inspect(page)).preview.bodies.length, 2);
  await page.locator(".body-transform-value").fill("25");
  await page.keyboard.press("Enter");
  const state = await inspect(page);
  assert.equal(state.document.bodies.length, 2);
  const copy = state.document.bodies.find((b) => b.id !== body.id);
  close(copy.center[0], 25);
  close(copy.center[1], 10);
  const ids = new Set([body.id, ...body.faces.map((f) => f.id), ...body.edges.map((e) => e.id)]);
  assert.ok(
    [copy.id, ...copy.faces.map((f) => f.id), ...copy.edges.map((e) => e.id)].every(
      (id) => !ids.has(id),
    ),
  );
  await chooseTool(page, "duplicate bodies", "duplicate");
  await page.keyboard.press("Escape");
  assert.equal((await inspect(page)).document.bodies.length, 2);
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.bodies.length, 1);
  await chooseTool(page, "redo", "redo");
  assert.equal((await inspect(page)).document.bodies.length, 2);
}

export async function bodySnapRoute(page, name) {
  const projection = await topProjection(page);
  // bodyMoveRoute left two transformed bodies and an active sketch.
  await chooseTool(page, "return to modeling", "modeling");
  await page.getByRole("button", { name: "Select Body 2", exact: true }).click();
  await page.keyboard.press("m");
  await quantity(page, "Move body X", 0.3);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await page.keyboard.press("m");
  await page.getByRole("button", { name: "Reposition body pivot", exact: true }).click();
  await quantity(page, "Move body Y", 10);
  await page.getByRole("button", { name: "Reposition body pivot", exact: true }).click();
  const before = (await inspect(page)).document.bodies;
  for (const bypass of [false, true]) {
    const box = await page.getByRole("button", { name: "Move body X", exact: true }).boundingBox();
    await page.evaluate(() => {
      window.addEventListener(
        "pointerdown",
        (event) => {
          window.snapDragStart = event.clientX;
        },
        { once: true },
      );
      window.addEventListener(
        "pointerup",
        (event) => {
          window.snapDragEnd = event.clientX;
        },
        { once: true },
      );
    });
    if (bypass) await page.keyboard.down("Shift");
    await page.mouse.move(box.x + 13, box.y + 13);
    await page.mouse.down();
    await page.mouse.move(box.x + 13 + 20 * projection.scale, box.y + 13, { steps: 6 });
    await page.mouse.up();
    if (bypass) await page.keyboard.up("Shift");
    assert.deepEqual((await inspect(page)).document.bodies, before);
    await page.keyboard.press("Enter");
    const after = (await inspect(page)).document.bodies;
    const delivered = await page.evaluate(() => window.snapDragEnd - window.snapDragStart);
    close(
      after.find((b) => b.id === before[0].id).center[0],
      before[0].center[0] + (bypass ? delivered / projection.scale : 20.3),
    );
    await chooseTool(page, "undo", "undo");
    await inspect(page);
  }
  await chooseTool(page, "duplicate bodies", "duplicate");
  await page.keyboard.press("Enter");
  assert.equal((await inspect(page)).document.bodies.length, 3);
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.bodies.length, 2);
  await page.screenshot({ path: `.cache/sketch-review/${name}-body-gizmo.png` });
  console.log(`${name}: axis edge snapping, Shift bypass, and in-place duplicate passed`);
}

async function assertDefaultAnchor(page) {
  const body = (await inspect(page)).document.bodies[0];
  const projection = await topProjection(page);
  const expected = projection.at(
    (body.bounds[0] + body.bounds[3]) / 2,
    (body.bounds[1] + body.bounds[4]) / 2,
  );
  const actual = await page
    .getByRole("button", { name: "Reposition body pivot", exact: true })
    .boundingBox();
  assert.ok(Math.abs(actual.x + actual.width / 2 - expected.x) < 0.1);
  assert.ok(Math.abs(actual.y + actual.height / 2 - expected.y) < 0.1);
}
