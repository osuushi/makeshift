import assert from "node:assert/strict";
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
  await quantity(page, "Rotate body Z", 90);
  body = (await inspect(page)).document.bodies[0];
  close(body.center[0], 0);
  close(body.center[1], 10);
  await chooseTool(page, "duplicate bodies", "duplicate");
  assert.equal((await inspect(page)).document.bodies.length, 1);
  assert.equal((await inspect(page)).preview.bodies.length, 2);
  await quantity(page, "Move body X", 25);
  state = await inspect(page);
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
  await groupDragAndSketch(page);
  await page.screenshot({ path: `.cache/sketch-review/${name}-body-move.png` });
  console.log(
    `${name}: exact body moves, pivot rotation, duplicate identities, multibody drag, cancellation/history and face sketch passed`,
  );
}

async function groupDragAndSketch(page) {
  const projection = await topProjection(page);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await page
    .getByRole("button", { name: "Select Body 2", exact: true })
    .click({ modifiers: ["Shift"] });
  await chooseTool(page, "transform", "transform");
  const beforeDrag = (await inspect(page)).document.bodies;
  const box = await page.getByRole("button", { name: "Move body Y", exact: true }).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 5 * projection.scale, {
    steps: 5,
  });
  await page.mouse.up();
  const state = await inspect(page);
  for (let i = 0; i < 2; i++)
    close(state.document.bodies[i].center[1], beforeDrag[i].center[1] + 5);
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  await page.locator(".body-transform-value").fill("123");
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, state.document);
  await ringDrag(page, state.document.bodies);
  await page.keyboard.press("Escape");
  // Choose a transformed face through the viewport and enter sketching.
  const facePoint = projection.at(0, 15);
  await page.mouse.click(facePoint.x, facePoint.y);
  await chooseTool(page, "sketch on face", "sketch-on-face");
  await page.keyboard.press("c");
  await drag(page, [0, 0], [1, 0]);
  assert.equal((await inspect(page)).document.sketches.length, 2);
}

async function ringDrag(page, bodies) {
  const handle = page.getByRole("button", { name: "Rotate body Z", exact: true });
  await handle.hover();
  const button = await handle.boundingBox();
  const offset = await handle.evaluate((element) => {
    const values = getComputedStyle(element).translate.split(" ").map(Number.parseFloat);
    return { x: values[0] || 0, y: values[1] || 0 };
  });
  const mass = bodies.reduce((n, b) => n + b.volume, 0);
  const center = [0, 1, 2].map(
    (i) => bodies.reduce((n, b) => n + b.center[i] * b.volume, 0) / mass,
  );
  const projection = await topProjection(page);
  const pivot = projection.at(center[0], center[1]);
  // A docked ring uses the display correction frozen at press for its plane ray.
  const x = pivot.x + offset.x,
    y = pivot.y + offset.y;
  const dx = button.x + button.width / 2 - x,
    dy = button.y + button.height / 2 - y;
  await page.evaluate(() => {
    window.bodyPointerSamples = { first: null, last: null };
    window.bodyPointerDown = (e) => {
      window.bodyPointerSamples.first = [e.clientX, e.clientY];
    };
    window.bodyPointerMove = (e) => {
      window.bodyPointerSamples.last = [e.clientX, e.clientY];
    };
    window.addEventListener("pointerdown", window.bodyPointerDown, { capture: true });
    window.addEventListener("pointermove", window.bodyPointerMove, { capture: true });
    window.addEventListener("pointerup", window.bodyPointerMove, { capture: true });
  });
  await page.mouse.move(x + dx, y + dy);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    const angle = (-i * Math.PI) / 24;
    await page.mouse.move(
      x + dx * Math.cos(angle) - dy * Math.sin(angle),
      y + dx * Math.sin(angle) + dy * Math.cos(angle),
    );
  }
  await page.mouse.up();
  const rotated = (await inspect(page)).document.bodies;
  const samples = await page.evaluate(() => {
    window.removeEventListener("pointerdown", window.bodyPointerDown, { capture: true });
    window.removeEventListener("pointermove", window.bodyPointerMove, { capture: true });
    window.removeEventListener("pointerup", window.bodyPointerMove, { capture: true });
    return window.bodyPointerSamples;
  });
  const rawAngle =
    Math.atan2(y - samples.last[1], samples.last[0] - x) -
    Math.atan2(y - samples.first[1], samples.first[0] - x);
  const pointerAngle = Math.atan2(Math.sin(rawAngle), Math.cos(rawAngle));
  assert.ok(
    Math.abs(pointerAngle - Math.PI / 2) < 0.03,
    "Quarter turn within pointer pixel resolution",
  );
  // The Move contract snaps world rotation to 5 degrees, even when a browser
  // rounds the projected marker center to an integer pointer coordinate.
  const step = (5 * Math.PI) / 180;
  const angle = Math.round(pointerAngle / step) * step;
  for (let i = 0; i < bodies.length; i++) {
    const dx = bodies[i].center[0] - center[0],
      dy = bodies[i].center[1] - center[1];
    close(rotated[i].center[0], center[0] + dx * Math.cos(angle) - dy * Math.sin(angle));
    close(rotated[i].center[1], center[1] + dx * Math.sin(angle) + dy * Math.cos(angle));
  }
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document.bodies, bodies);
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

async function topProjection(page) {
  const { camera } = await inspect(page);
  const bounds = await page.locator("canvas").boundingBox();
  const scale = bounds.height / camera.height;
  return {
    scale,
    at: (x, y) => ({
      x: bounds.x + bounds.width / 2 + (x - camera.target[0]) * scale,
      y: bounds.y + bounds.height / 2 - (y - camera.target[1]) * scale,
    }),
  };
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
