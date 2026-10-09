import assert from "node:assert/strict";
import * as THREE from "three";
import { project } from "./ui-blend-edit.mjs";
import { cameraRoute } from "./ui-camera.mjs";
import { inspect, reset } from "./ui-helpers.mjs";
import { makePivotBox } from "./ui-orbit-pivot.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

function direction(camera) {
  return new THREE.Vector3(...camera.position).sub(new THREE.Vector3(...camera.target)).normalize();
}
function projectedAxis(camera, axis) {
  const view = new THREE.PerspectiveCamera();
  view.position.fromArray(camera.position);
  view.up.fromArray(camera.up);
  view.lookAt(new THREE.Vector3(...camera.target));
  return axis.clone().applyQuaternion(view.quaternion.clone().invert());
}

async function commandAxisRoute(page, side) {
  await reset(page);
  await page.getByRole("button", { name: "Top view", exact: true }).dblclick();
  const before = await inspect(page);
  const box = await page.getByLabel("Modeling viewport", { exact: true }).boundingBox();
  assert.ok(box);
  const radius = Math.min(box.width, box.height) / 2;
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.keyboard.down("Meta");
  await page.mouse.down();
  await page.mouse.move(start.x + radius * 0.025, start.y + radius * 0.6 * side, { steps: 8 });
  const during = await page.evaluate(() => window.makeshiftInspect());
  const y = projectedAxis(during.camera, new THREE.Vector3(0, 1, 0));
  const z = projectedAxis(during.camera, new THREE.Vector3(0, 0, 1));
  assert.ok(Math.abs(Math.atan2(y.x, y.y)) < THREE.MathUtils.degToRad(20));
  assert.ok(y.z * side > 0, "Gesture crosses to the expected side of the Y-normal plane");
  assert.ok(Math.hypot(y.x, y.y) < Math.hypot(z.x, z.y), "Nearer axis is foreshortened");
  await page.mouse.up();
  await page.keyboard.up("Meta");
  const snapped = await inspect(page);
  const axis = side > 0 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  const vertical = projectedAxis(snapped.camera, axis);
  assert.ok(
    Math.abs(vertical.x) < 1e-8 && vertical.y > 0 && vertical.z > 0,
    "Release levels an axis whose perpendicular plane is viewed from above",
  );
  if (side > 0) {
    assert.ok(direction(snapped.camera).distanceTo(direction(during.camera)) < 1e-8);
  } else {
    const previous = projectedAxis(snapped.camera, new THREE.Vector3(0, 1, 0));
    assert.ok(
      Math.abs(previous.x) < 1e-8 && previous.y > 0,
      "Handoff keeps previous Y vertical while aligning new Z",
    );
    const expected = direction(during.camera).setX(0).normalize();
    assert.ok(
      direction(snapped.camera).distanceTo(expected) < 1e-8,
      "Handoff removes only viewing skew outside the YZ plane",
    );
  }
  assert.equal(snapped.camera.height, before.camera.height);
  assert.deepEqual(snapped.document, before.document);

  await page.mouse.move(start.x, start.y);
  await page.keyboard.down("Meta");
  await page.mouse.down();
  const endX = Math.round(start.x + radius * 0.1);
  await page.mouse.move(endX, start.y, { steps: 6 });
  const yawed = await page.evaluate(() => window.makeshiftInspect());
  const expected = direction(snapped.camera).applyAxisAngle(axis, (-2 * (endX - start.x)) / radius);
  assert.ok(
    direction(yawed.camera).distanceTo(expected) < 1e-8,
    "Next drag orbits about the above-plane axis",
  );
  await page.mouse.up();
  await page.keyboard.up("Meta");
  await inspect(page);
}

async function cubeHandoff(page) {
  await makePivotBox(page);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Top view", exact: true }).dblclick();
  const before = await inspect(page);
  const box = await page.locator(".orientation-cube").boundingBox();
  assert.ok(box);
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + box.width * 0.02, y - box.height * 0.3, { steps: 8 });
  const during = await inspect(page);
  const pivot = during.camera.orbitPivot;
  assert.ok(pivot, "Cube drag acquires a real geometry pivot");
  const fixed = await project(page, pivot);
  await page.mouse.up();
  const after = await inspect(page);
  for (const axis of [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]) {
    const p = projectedAxis(after.camera, axis);
    assert.ok(Math.abs(p.x) < 1e-8 && p.y > 0, "Cube handoff aligns both axes");
  }
  const moved = await project(page, pivot);
  assert.ok(
    Math.hypot(fixed.x - moved.x, fixed.y - moved.y) < 1e-6,
    "Release keeps the acquired surface pivot fixed on screen",
  );
  assert.deepEqual(after.document, before.document);
  assert.equal(after.camera.height, before.camera.height);
}

await withUiRuntimes(
  async (page, name) => {
    for (const side of [1, -1]) await commandAxisRoute(page, side);
    await cubeHandoff(page);
    console.log(
      `${name}: two-axis handoff and above-plane release snap and subsequent Command yaw passed`,
    );
    await cameraRoute(page, name);
  },
  { defaults: ["chromium", "webkit"], timeout: 30000 },
);
