import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { fitCameraDepth } from "../src/sketch/camera-depth.js";
import { planes } from "../src/sketch/planes.js";

// Camera and body bounds from founder Capture fixture 2026-09-27T02:17:43.103Z.
const position = [56.7357904025683, -26.274571002704292, 73.23082556143513];
const target = new THREE.Vector3(17.40485801630051, 53.55255215057217, 8.186931407576466);
const up = [-0.26080112697203384, 0.5293290145488311, 0.8073373313100791];
const boxes = [
  [4.98980639075273, 11.982137995936075, -8, 32.9948861095692, 16.01785224074552, 8],
  [-17.412385824957685, 6, -8.34535381133514, -6.5876141750423125, 36.0000001, 8.34535394919483],
  [48, 12, 106, 112, 16.000000000000004, 134],
];
const points = boxes.flatMap((b) =>
  [b[0], b[3]].flatMap((x) =>
    [b[1], b[4]].flatMap((y) => [b[2], b[5]].map((z) => new THREE.Vector3(x, y, z))),
  ),
);
function view() {
  const c = new THREE.OrthographicCamera(-130, 130, 111.6145745966, -111.6145745966, 0.1, 10000);
  c.position.fromArray(position);
  c.up.fromArray(up);
  c.lookAt(target);
  c.updateMatrixWorld();
  return c;
}
function fit(camera: THREE.OrthographicCamera, bounds: THREE.Box3, height = 223.22914919322113) {
  fitCameraDepth(camera, target, height, bounds);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
}
test("captured sliced body becomes fully visible with identical screen coordinates and pickable rays", () => {
  const camera = view();
  const before = points.map((p) => p.clone().project(camera));
  assert.ok(
    before.some((p) => p.z < -1),
    "Captured pose really clips the upper body",
  );
  const bounds = new THREE.Box3().setFromPoints(points);
  fit(camera, bounds);
  for (const [i, p] of points.entries()) {
    const projected = p.clone().project(camera);
    assert.ok(projected.z > -1 && projected.z < 1);
    assert.ok(Math.abs(projected.x - before[i].x) < 1e-12);
    assert.ok(Math.abs(projected.y - before[i].y) < 1e-12);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(projected.x, projected.y), camera);
    assert.ok(p.clone().sub(ray.ray.origin).dot(ray.ray.direction) > 0);
    assert.ok(ray.ray.distanceToPoint(p) < 1e-10);
  }
  const after = camera.position.clone();
  fit(camera, bounds);
  assert.ok(camera.position.distanceTo(after) < 1e-10, "Repeated paint does not move the camera");
});
test("depth fitting includes geometry beyond the old far limit and remains finite at zoom extremes", () => {
  for (const height of [0.5, 10000]) {
    const camera = view();
    const bounds = new THREE.Box3(
      new THREE.Vector3(-20000, -20000, -20000),
      new THREE.Vector3(20000, 20000, 20000),
    );
    fit(camera, bounds, height);
    for (const x of [-20000, 20000])
      for (const y of [-20000, 20000])
        for (const z of [-20000, 20000]) {
          const depth = new THREE.Vector3(x, y, z).project(camera).z;
          assert.ok(depth > -1 && depth < 1);
        }
    assert.ok(camera.far > 10000 && Number.isFinite(camera.far));
  }
});
test("ordinary in-range geometry and empty scenes do not move the camera", () => {
  const camera = view(),
    before = camera.position.clone();
  fit(camera, new THREE.Box3());
  assert.ok(camera.position.equals(before));
  fit(camera, new THREE.Box3().setFromPoints(points.slice(0, 16)));
  assert.ok(camera.position.equals(before));
});

test("full-view reference intersections stay in front of the camera at every viewport corner", () => {
  const pivot = new THREE.Vector3(-25.924250097, -4.379583638, 20.08206411);
  const camera = new THREE.OrthographicCamera(-60, 60, 40, -40, 0.1, 10000);
  camera.position.set(43.357775649, -73.661620519, 89.364098391);
  camera.up.set(0.4082482923, 0.8164965539, 0.4082483426);
  camera.lookAt(pivot);
  camera.updateMatrixWorld();
  const corners: THREE.Vector3[] = [];
  for (const frame of Object.values(planes)) {
    const normal = new THREE.Vector3(...frame.u).cross(new THREE.Vector3(...frame.v));
    for (const x of [-1, 1])
      for (const y of [-1, 1]) {
        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2(x, y), camera);
        const distance = -ray.ray.origin.dot(normal) / ray.ray.direction.dot(normal);
        corners.push(ray.ray.origin.clone().addScaledVector(ray.ray.direction, distance));
      }
  }
  const before = corners.map((p) => p.clone().project(camera));
  assert.ok(
    before.some((p) => p.z < -1),
    "Demo pose clips the lower-left reference fill",
  );
  fitCameraDepth(camera, pivot, 80, new THREE.Box3(), Object.values(planes));
  camera.lookAt(pivot);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  for (const [index, point] of corners.entries()) {
    const after = point.clone().project(camera);
    assert.ok(after.z > -1 && after.z < 1);
    assert.ok(Math.abs(after.x - before[index].x) < 1e-10);
    assert.ok(Math.abs(after.y - before[index].y) < 1e-10);
  }
  const fitted = camera.position.clone();
  fitCameraDepth(camera, pivot, 80, new THREE.Box3(), Object.values(planes));
  assert.ok(camera.position.distanceTo(fitted) < 1e-10);
});
