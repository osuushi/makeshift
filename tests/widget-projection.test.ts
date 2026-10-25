import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { arrowPoint, readableWidgetFrame } from "../src/model/widget-projection.js";
import { markerMarkup } from "../src/sketch/move-widget/marker.js";

const camera = new THREE.OrthographicCamera();
test("Widget fronts and shafts stay 30 degrees clear of edge-on and end-on on both sides", () => {
  for (let pitch = 0; pitch <= 180; pitch += 3) {
    for (let roll = 0; roll < 360; roll += 5) {
      const rotation = new THREE.Quaternion().setFromEuler(
        new THREE.Euler((pitch * Math.PI) / 180, 0, (roll * Math.PI) / 180),
      );
      const axis = new THREE.Vector3(0, 0, 1).applyQuaternion(rotation);
      const width = new THREE.Vector3(1, 0, 0).applyQuaternion(rotation);
      const { u, v, w } = readableWidgetFrame(camera, axis.toArray(), width.toArray());
      assert.ok(Math.hypot(u.x, u.y) >= 0.5 - 1e-12);
      assert.ok(Math.abs(w.z) >= 0.5 - 1e-12);
      assert.ok(Math.abs(u.dot(v)) < 1e-12);
      assert.ok(Math.abs(v.length() - 1) < 1e-12);
      const tip = u.clone().multiplyScalar(24);
      const left = arrowPoint(u, tip, -10, -8);
      const right = arrowPoint(u, tip, -10, 8);
      assert.ok(Math.abs(left.distanceTo(right) - 16) < 1e-12);
      assert.equal(left.z, tip.z);
      assert.equal(right.z, tip.z);
    }
  }
});

test("Readable frames preserve the source frame and camera; end-on glyphs remain finite", () => {
  const axis: [number, number, number] = [1, 0, 0];
  const width: [number, number, number] = [0, 1, 0];
  const result = readableWidgetFrame(camera, axis, width);
  assert.deepEqual(result.u.toArray(), axis);
  assert.deepEqual(result.v.toArray(), width);
  for (const sign of [-1, 1]) {
    const markup = markerMarkup(camera, [0, 0, sign], width, false);
    assert.ok(!/NaN|Infinity/.test(markup));
  }
  assert.deepEqual(axis, [1, 0, 0]);
  assert.deepEqual(width, [0, 1, 0]);
  assert.deepEqual(camera.quaternion.toArray(), [0, 0, 0, 1]);
});

test("Captured circular-edge cameras keep their section legible", () => {
  // Frames derived from the selected edge in the founder's two 2026-10-25 21:42 fixtures.
  const axis: [number, number, number] = [-Math.SQRT1_2, -0.7008508879951776, -0.0938511203788801];
  const width: [number, number, number] = [
    -0.7069962725089076, 0.7030877901167772, 0.07631402261194806,
  ];
  const views = [
    {
      position: [-5562.995828728062, 5672.850570417696, 748.7131868963223],
      up: [-0.7237250653143085, -0.684903129184353, -0.08443774907753894],
      target: [-55.05857006302011, -60.153726296036396, 41.92421537730331],
    },
    {
      position: [-5407.416695556999, -5837.807061211242, -594.376607071621],
      up: [-0.7419898483796441, 0.6658177757116346, 0.0783438220152951],
      target: [-56.53375088294892, 43.80513313083389, 97.68659058636962],
    },
  ];
  for (const view of views) {
    const camera = new THREE.OrthographicCamera();
    camera.position.fromArray(view.position);
    camera.up.fromArray(view.up);
    camera.lookAt(new THREE.Vector3().fromArray(view.target));
    const { u, w } = readableWidgetFrame(camera, axis, width);
    assert.ok(Math.hypot(u.x, u.y) >= 0.5 - 1e-12);
    assert.ok(Math.abs(w.z) >= 0.5 - 1e-12);
  }
});
