import assert from "node:assert/strict";
import { orient, project } from "./ui-blend-edit.mjs";
import { displaySettings } from "./ui-decorator-display.mjs";
import { holdPreviews, previewReady } from "./ui-decorator-worker-control.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { at, close, drag, inspect, modalCompleted, reset } from "./ui-helpers.mjs";
import { clearSelection } from "./ui-reconnection-helpers.mjs";
import { chooseTool as command } from "./ui-tools.mjs";

export { command };

export async function completed(page) {
  await modalCompleted(page);
  return inspect(page);
}
export async function cylinder(page) {
  await reset(page);
  await displaySettings(page, (dialog) =>
    dialog.getByRole("button", { name: "Reset decorator display" }).click(),
  );
  await circleBody(page, 8, 10);
  const state = await completed(page);
  assert.equal(state.document.bodies.length, 1);
  close(state.document.bodies[0].volume, Math.PI * 64 * 10);
  const face = state.document.bodies[0].faces.find((face) => face.cylinder);
  assert.ok(face);
  close(face.cylinder.radius, 8);
  return state.document;
}
export async function circleBody(page, radius, height, origin = [0, 0]) {
  await command(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("c");
  await drag(page, origin, [origin[0] + radius, origin[1]], ["Shift"]);
  const field = page.getByRole("textbox", { name: "Radius", exact: true });
  await field.fill(String(radius));
  await field.press("Enter");
  await completed(page);
  const center = await at(page, ...origin);
  await command(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "profile");
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).fill(String(height));
  await page
    .locator(".extrude-controls")
    .getByRole("button", { name: "New body", exact: true })
    .click();
  await page.getByRole("button", { name: "Accept extrusion", exact: true }).click();
  await completed(page);
}
export async function threads(page, hold = false) {
  await clearSelection(page);
  await orient(page, [0, -1, 0.3]);
  await worldClick(page, [0, -8, 5]);
  const selected = (await inspect(page)).modelingSelection;
  assert.equal(selected[0]?.kind, "face");
  if (hold) await holdPreviews(page);
  await command(page, "threads", "threads");
  const state = await completed(page);
  assert.equal(state.document.decorators.length, 1);
  assert.equal(state.document.decorators[0].problem, undefined);
  assert.deepEqual(
    state.document.decorators[0].faces,
    selected.map(({ body, face }) => ({ body, face })),
  );
  if (!hold) await previewReady(page);
  return state.document;
}
export async function marker(page, expected, { busy = true } = {}) {
  await page.waitForFunction(() => window.makeshiftInspect().decoratorFallbackBounds.length > 0);
  const state = await inspect(page);
  assert.deepEqual(state.preview ?? state.document, expected);
  assert.equal(
    state.decoratorPreviewBounds.length,
    0,
    "No old/generated mesh may hide pending support coloring",
  );
  const supports = new Map();
  for (const instance of expected.decorators) {
    assert.equal(instance.problem, undefined);
    for (const reference of instance.faces) {
      const body = expected.bodies.find((body) => body.id === reference.body);
      const face = body?.faces.find((face) => face.id === reference.face);
      assert.ok(
        face?.vertices.length,
        "Every valid attachment resolves to current trimmed triangles",
      );
      supports.set(body.id, [...(supports.get(body.id) ?? []), ...face.vertices]);
    }
  }
  assert.equal(state.decoratorFallbackBounds.length, supports.size);
  for (const bounds of state.decoratorFallbackBounds) {
    const vertices = supports.get(bounds.body);
    assert.ok(vertices);
    assert.equal(bounds.triangles, vertices.length / 9);
    for (let axis = 0; axis < 3; axis++) {
      const values = vertices.filter((_, index) => index % 3 === axis);
      // Render buffers use Float32; geometry/history comparisons remain exact separately.
      assert.ok(Math.abs(bounds.min[axis] - Math.min(...values)) < 1e-5);
      assert.ok(Math.abs(bounds.max[axis] - Math.max(...values)) < 1e-5);
    }
  }
  assert.equal(await page.locator(".decorator-preview-status").isVisible(), busy);
  return state;
}
export async function coloredFace(page, name, xyz = [0, -8, 5]) {
  await page.mouse.move(90, 70);
  const point = await project(page, xyz);
  const png = await page.screenshot({
    clip: { x: Math.round(point.x) - 12, y: Math.round(point.y) - 12, width: 24, height: 24 },
  });
  const colored = await page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 24;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, 24, 24).data;
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (Math.max(...pixels.slice(i, i + 3)) - Math.min(...pixels.slice(i, i + 3)) > 25) count++;
    return count;
  }, png.toString("base64"));
  assert.ok(colored > 400, `Visible attached face stays colored (${colored}/576)`);
  await page.screenshot({ path: `.cache/sketch-review/${name}.png` });
}
export async function releaseDetail(page, expected) {
  await holdPreviews(page, false);
  await previewReady(page);
  const state = await inspect(page);
  assert.deepEqual(state.document, expected);
  assert.equal(state.decoratorFallbackBounds.length, 0);
  assert.ok(state.decoratorPreviewBounds.every((mesh) => mesh.triangles > 0));
}
export async function pickThreadFace(page, expected) {
  await clearSelection(page);
  await orient(page, [0, -1, 0.3]);
  await worldClick(page, [0, -8, 5]);
  const state = await inspect(page);
  assert.deepEqual(state.document, expected);
  assert.equal(state.modelingSelection[0]?.kind, "face");
  assert.ok(
    expected.decorators.some((instance) =>
      instance.faces.some(
        (reference) =>
          reference.body === state.modelingSelection[0].body &&
          reference.face === state.modelingSelection[0].face,
      ),
    ),
  );
}
