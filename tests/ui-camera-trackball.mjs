import assert from "node:assert/strict";
import * as THREE from "three";
import { drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function trackballRoute(page, name) {
  await reset(page);
  await centerTurntable(page);
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await inspect(page);
  await page.keyboard.press("r");
  await drag(page, [0, 0], [20, 10]);
  const before = await inspect(page);
  const bounds = await page.locator("canvas").boundingBox();
  const x = bounds.x + bounds.width / 2,
    y = bounds.y + bounds.height * 0.9;
  await page.mouse.move(x, y);
  await page.keyboard.down("Meta");
  await page.mouse.down();
  await page.mouse.move(x, y - 30, { steps: 3 });
  const first = await inspect(page);
  const diagnostic = page.locator('[aria-label="Rotation grab diagnostic"]');
  assert.equal(await diagnostic.count(), 0);
  assert.equal(first.camera.orbitActive, true);
  await page.mouse.move(x, y - 60);
  const second = await inspect(page);
  assert.deepEqual(second.document, before.document, "Command drag cannot draw or edit");
  assert.deepEqual(second.modelingSelection, before.modelingSelection);
  assert.ok(Math.abs(second.camera.up[0]) < 1e-8);
  await page.screenshot({ path: `.cache/sketch-review/${name}-orbit.png` });
  // Releasing the modifier does not drop an already captured drag.
  await page.keyboard.up("Meta");
  await page.mouse.move(x, y - 80);
  const released = await inspect(page);
  await page.mouse.up();
  const ended = await inspect(page);
  for (let i = 0; i < 3; i++)
    assert.ok(
      Math.abs(ended.camera.position[i] - released.camera.position[i]) < 1e-8,
      "Leveling only rolls",
    );
  await page.mouse.move(x + 40, y - 90);
  assert.deepEqual((await inspect(page)).camera, ended.camera, "Release ends the grab");
  await page.waitForTimeout(300);
  assert.deepEqual(
    (await inspect(page)).camera,
    ended.camera,
    "No motion after leveling completes",
  );
  await page.keyboard.down("Meta");
  await page.mouse.down();
  await page.mouse.move(x + 60, y - 90);
  await page.keyboard.press("Escape");
  const cancelled = await inspect(page);
  await page.mouse.move(x + 80, y - 90);
  await page.mouse.up();
  await page.keyboard.up("Meta");
  assert.deepEqual((await inspect(page)).camera, cancelled.camera, "Escape releases capture");
  await page.mouse.wheel(20, 10);
  await page.waitForTimeout(60);
  const panned = await inspect(page);
  assert.notDeepEqual(panned.camera.target, cancelled.camera.target);
  assert.equal(await diagnostic.isVisible(), false);
  assert.deepEqual(panned.document, before.document);
  await explicitRoll(page, bounds);
  console.log(
    `${name}: uniform turntable orbits at the rim; Option rolls explicitly, isolates editing and ends on release/Escape`,
  );
}

async function centerTurntable(page) {
  const bounds = await page.locator("canvas").boundingBox();
  const x = bounds.x + bounds.width / 2,
    y = bounds.y + bounds.height / 2;
  const before = await inspect(page);
  await page.mouse.move(x, y);
  await page.keyboard.down("Meta");
  await page.mouse.down();
  await page.mouse.move(x + 55, y - 40, { steps: 5 });
  const during = await inspect(page);
  assert.equal(during.camera.orbitActive, true);
  assert.notDeepEqual(during.camera.position, before.camera.position);
  const direction = during.camera.position.map((v, i) => v - during.camera.target[i]);
  const length = Math.hypot(...direction);
  const n = direction.map((v) => v / length),
    u = during.camera.up;
  const right = [u[1] * n[2] - u[2] * n[1], u[2] * n[0] - u[0] * n[2], u[0] * n[1] - u[1] * n[0]];
  assert.ok(Math.abs(right[2]) < 1e-8, "World Z remains vertical during a center drag");
  await page.mouse.up();
  await page.keyboard.up("Meta");
  assert.equal(
    await page.evaluate(() => window.makeshiftInspect().camera.moving),
    true,
    "Center drag also starts release leveling",
  );
  await page.waitForTimeout(300);
  const ended = await inspect(page);
  assert.ok(
    ended.camera.up.every((value, i) => Math.abs(value - during.camera.up[i]) < 1e-10),
    "Center drag needs no horizon correction",
  );
  assert.deepEqual(ended.document, before.document);
}

async function explicitRoll(page, bounds) {
  const x = bounds.x + bounds.width / 2,
    y = bounds.y + bounds.height / 2;
  const before = await inspect(page);
  await page.mouse.move(x + 100, y);
  await page.keyboard.down("Meta");
  await page.keyboard.down("Alt");
  await page.mouse.down();
  await page.mouse.move(x + 100, y + 60, { steps: 4 });
  const rolled = await inspect(page);
  assert.notDeepEqual(rolled.camera.up, before.camera.up, "Option drag rolls even at center");
  const viewDirection = (camera) =>
    new THREE.Vector3(...camera.position).sub(new THREE.Vector3(...camera.target)).normalize();
  // Depth fitting may retreat the finite camera along its unchanged viewing ray.
  assert.ok(viewDirection(rolled.camera).distanceTo(viewDirection(before.camera)) < 1e-8);
  assert.deepEqual(rolled.camera.target, before.camera.target);
  assert.equal(rolled.camera.height, before.camera.height);
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await page.keyboard.up("Meta");
  const after = await inspect(page);
  assert.notDeepEqual(after.camera.up, rolled.camera.up, "Explicit roll snaps on release");
  assert.deepEqual(after.document, before.document);

  await page.mouse.move(x, y);
  await page.keyboard.down("Meta");
  await page.mouse.down();
  await page.mouse.move(x + 20, y);
  const orbit = await inspect(page);
  await page.keyboard.down("Alt");
  await page.mouse.move(x + 60, y + 40);
  const switched = await inspect(page);
  for (let i = 0; i < 3; i++)
    assert.ok(Math.abs(switched.camera.position[i] - orbit.camera.position[i]) < 1e-8);
  assert.notDeepEqual(switched.camera.up, orbit.camera.up);
  await page.keyboard.up("Alt");
  await page.mouse.move(x + 90, y + 40);
  assert.notDeepEqual((await inspect(page)).camera.position, switched.camera.position);
  await page.mouse.up();
  await page.keyboard.up("Meta");
  const level = await inspect(page);
  assert.deepEqual(level.document, before.document);
  const direction = level.camera.position.map((v, i) => v - level.camera.target[i]);
  const n = direction.map((v) => v / Math.hypot(...direction)),
    u = level.camera.up;
  const right = [u[1] * n[2] - u[2] * n[1], u[2] * n[0] - u[0] * n[2], u[0] * n[1] - u[1] * n[0]];
  assert.ok(
    right.some((v, i) => Math.abs(n[i]) < 1 - 1e-8 && Math.abs(v) < 1e-8),
    "Ordinary orbit still levels on release",
  );
}
