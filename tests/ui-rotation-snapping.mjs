import assert from "node:assert/strict";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function rotationSnappingRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-10, -6], [10, 6]);
  const original = (await inspect(page)).document;
  const from = (await inspect(page)).rotationHandle;
  const origin = await at(page, 0, 0);
  const radians = (-16 * Math.PI) / 180;
  const dx = from.x - origin.x,
    dy = from.y - origin.y;
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // Radial travel clears the gesture threshold, but a tiny angular change stays zero.
  const tiny = (-0.073 * Math.PI) / 180;
  await page.mouse.move(
    origin.x + 1.2 * (dx * Math.cos(tiny) - dy * Math.sin(tiny)),
    origin.y + 1.2 * (dx * Math.sin(tiny) + dy * Math.cos(tiny)),
    { steps: 4 },
  );
  const small = await inspect(page);
  const tinyLine = (small.preview ?? small.document).sketches[0].curves[0];
  assert.equal(tinyLine.b.y - tinyLine.a.y, 0, "imperceptible pointer angle stays zero");
  await page.mouse.move(
    origin.x + dx * Math.cos(radians) - dy * Math.sin(radians),
    origin.y + dx * Math.sin(radians) + dy * Math.cos(radians),
    { steps: 8 },
  );
  const angle = async () => {
    const state = await inspect(page);
    const curves = (state.preview ?? state.document).sketches[0].curves;
    const line = curves[curves.length - 4];
    return (Math.atan2(line.b.y - line.a.y, line.b.x - line.a.x) * 180) / Math.PI;
  };
  const coarse = await angle();
  assert.ok(Math.abs(coarse - 15) < 1e-6);
  await page.keyboard.down("Shift");
  const fine = await angle();
  assert.ok(fine >= 15.5 - 1e-6 && fine <= 16.5 + 1e-6);
  assert.ok(Math.abs(fine * 2 - Math.round(fine * 2)) < 1e-6);
  await page.keyboard.down("Alt");
  assert.ok(Math.abs((await angle()) - fine) < 1e-6);
  await page.keyboard.up("Alt");
  assert.ok(Math.abs((await angle()) - fine) < 1e-6);
  await page.keyboard.up("Shift");
  assert.ok(Math.abs((await angle()) - coarse) < 1e-6);
  await page.mouse.up();
  assert.ok(Math.abs((await angle()) - 15) < 1e-6);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  console.log(`${name}: 5°/0.5° rotation, stationary modifiers, accepted geometry and Undo passed`);
}

export async function placementRotationSnapping(page, from, origin) {
  const original = (await inspect(page)).document;
  const handle = page.getByRole("button", { name: "Rotate sketch Z", exact: true });
  await handle.hover();
  const box = await handle.boundingBox();
  from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const offset = await handle.evaluate((element) => {
    const values = getComputedStyle(element).translate.split(" ").map(Number.parseFloat);
    return { x: values[0] || 0, y: values[1] || 0 };
  });
  origin = { x: origin.x + offset.x, y: origin.y + offset.y };
  const radians = (-16 * Math.PI) / 180;
  const dx = from.x - origin.x,
    dy = from.y - origin.y;
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(
    origin.x + dx * Math.cos(radians) - dy * Math.sin(radians),
    origin.y + dx * Math.sin(radians) + dy * Math.cos(radians),
    { steps: 8 },
  );
  const input = page.getByRole("textbox", { name: "Rotation Z", exact: true });
  assert.equal(Number(await input.inputValue()), 15);
  await page.keyboard.down("Shift");
  const fine = Number(await input.inputValue());
  assert.ok(fine >= 15.5 - 1e-6 && fine <= 16.5 + 1e-6);
  assert.equal(fine * 2, Math.round(fine * 2));
  await page.keyboard.down("Alt");
  assert.equal(Number(await input.inputValue()), fine);
  const state = await inspect(page);
  const frame = state.preview.sketches.at(-1).plane;
  assert.ok(Math.abs((Math.atan2(frame.u[1], frame.u[0]) * 180) / Math.PI - fine) < 1e-6);
  await page.keyboard.up("Alt");
  assert.equal(Number(await input.inputValue()), fine);
  await page.keyboard.up("Shift");
  assert.equal(Number(await input.inputValue()), 15);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.deepEqual((await inspect(page)).document, original);
}
