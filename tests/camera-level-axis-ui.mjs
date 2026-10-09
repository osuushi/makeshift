import assert from "node:assert/strict";
import * as THREE from "three";
import { cameraRoute } from "./ui-camera.mjs";
import { inspect, reset } from "./ui-helpers.mjs";
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

await withUiRuntimes(
  async (page, name) => {
    for (const side of [1, -1]) {
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
      assert.ok(direction(snapped.camera).distanceTo(direction(during.camera)) < 1e-8);
      assert.equal(snapped.camera.height, before.camera.height);
      assert.deepEqual(snapped.document, before.document);

      await page.mouse.move(start.x, start.y);
      await page.keyboard.down("Meta");
      await page.mouse.down();
      const endX = Math.round(start.x + radius * 0.1);
      await page.mouse.move(endX, start.y, { steps: 6 });
      const yawed = await page.evaluate(() => window.makeshiftInspect());
      const expected = direction(snapped.camera).applyAxisAngle(
        axis,
        (-2 * (endX - start.x)) / radius,
      );
      assert.ok(
        direction(yawed.camera).distanceTo(expected) < 1e-8,
        "Next drag orbits about the above-plane axis",
      );
      await page.mouse.up();
      await page.keyboard.up("Meta");
      await inspect(page);
    }
    console.log(
      `${name}: above-plane release snap on both sides and subsequent Command yaw passed`,
    );
    await cameraRoute(page, name);
  },
  { defaults: ["chromium", "webkit"], timeout: 30000 },
);
