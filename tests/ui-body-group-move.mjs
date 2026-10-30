import assert from "node:assert/strict";
import { close, drag, inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function groupDragAndSketch(page) {
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
  assert.deepEqual((await inspect(page)).document.bodies, beforeDrag);
  await page.keyboard.press("Enter");
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
  const selected = await inspect(page);
  const target = selected.modelingSelection[0];
  assert.equal(target.kind, "face");
  const face = selected.document.bodies
    .find((body) => body.id === target.body)
    .faces.find((face) => face.id === target.face);
  await chooseTool(page, "sketch on face", "sketch-on-face");
  // Draw at the fitted center: a trimmed face's plane origin can be offscreen.
  const { camera } = await inspect(page);
  const local = [face.plane.u, face.plane.v].map((axis) =>
    axis.reduce((sum, value, i) => sum + value * (camera.target[i] - face.plane.origin[i]), 0),
  );
  await page.keyboard.press("c");
  await drag(page, local, [local[0] + 1, local[1]]);
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
  assert.deepEqual((await inspect(page)).document.bodies, bodies);
  await page.keyboard.press("Enter");
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

export async function topProjection(page) {
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
