import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { restoreCamera } from "../src/model/camera-state.js";
import {
  alignCameraToPlane,
  applyCameraPose,
  panCamera,
  planeCameraPose,
  rollCamera,
  zoomCamera,
} from "../src/sketch/camera-motion.js";
import { planes } from "../src/sketch/planes.js";
import type { World } from "../src/sketch/world.js";

test("startup without a saved camera resets to balanced isometric projection", () => {
  const camera = new THREE.OrthographicCamera(-40, 40, 40, -40);
  const target = new THREE.Vector3(10, 20, 30);
  const view = {
    camera,
    target,
    height: 12,
    navigation: { clear() {} },
    cancelCameraMotion() {},
    draw() {
      camera.lookAt(target);
      camera.updateMatrixWorld();
    },
  };
  restoreCamera(view as unknown as World, undefined);
  assert.deepEqual(target.toArray(), [0, 0, 0]);
  assert.equal(view.height, 80);
  const lengths = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
  ].map((axis) => {
    const projected = axis.project(camera);
    return Math.hypot(projected.x, projected.y);
  });
  assert.ok(Math.max(...lengths) - Math.min(...lengths) < 1e-12);
});

test("plane alignment chooses the closest axis-aligned side and roll", () => {
  const camera = new THREE.OrthographicCamera();
  camera.position.set(55, -70, 65);
  camera.up.set(0, 0, 1);
  const view = { camera, target: new THREE.Vector3(), height: 80 };
  camera.lookAt(view.target);
  camera.updateMatrixWorld();
  alignCameraToPlane(view, planes.XZ);
  camera.lookAt(view.target);
  camera.updateMatrixWorld();
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  assert.ok(camera.position.y < 0, "entry keeps the nearer side of the plane");
  assert.ok(right.dot(new THREE.Vector3(...planes.XZ.u)) > 0.999999);
  assert.ok(up.dot(new THREE.Vector3(...planes.XZ.v)) > 0.999999);
});

test("plane alignment preserves the nearest in-plane half-turn when it is already aligned", () => {
  const camera = new THREE.OrthographicCamera();
  camera.position.set(0, -120, 0);
  camera.up.set(0, 0, -1);
  const view = { camera, target: new THREE.Vector3(), height: 80 };
  camera.lookAt(view.target);
  camera.updateMatrixWorld();
  alignCameraToPlane(view, planes.XZ);
  camera.lookAt(view.target);
  camera.updateMatrixWorld();
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  assert.ok(right.dot(new THREE.Vector3(...planes.XZ.u)) < -0.999999);
  assert.ok(up.dot(new THREE.Vector3(...planes.XZ.v)) < -0.999999);
});

test("plane entry retains the nearest quarter turn on either side of coordinate and tilted planes", () => {
  const tilted = {
    origin: [7, -4, 12] as [number, number, number],
    u: [Math.SQRT1_2, Math.SQRT1_2, 0] as [number, number, number],
    v: [0, 0, 1] as [number, number, number],
  };
  for (const frame of [...Object.values(planes), tilted]) {
    const unchanged = structuredClone(frame);
    const normal = new THREE.Vector3(...frame.u).cross(new THREE.Vector3(...frame.v));
    for (const side of [-1, 1]) {
      for (const quarter of [1, 3]) {
        for (const offset of [-0.12, 0.12]) {
          const camera = new THREE.OrthographicCamera();
          const target = new THREE.Vector3(...frame.origin);
          camera.position.copy(target).addScaledVector(normal, 120 * side);
          camera.up.fromArray(frame.v).applyAxisAngle(normal, (quarter * Math.PI) / 2);
          camera.lookAt(target);
          const expected = camera.quaternion.clone();
          camera.up.applyAxisAngle(normal, offset);
          camera.position.addScaledVector(new THREE.Vector3(...frame.u), 9);
          camera.lookAt(target);
          const before = camera.quaternion.clone();
          const view = { camera, target, height: 80 };
          const pose = planeCameraPose(view, frame);
          assert.ok(pose.quaternion.angleTo(expected) < 1e-7);
          assert.ok(before.angleTo(pose.quaternion) < 0.15, "Entry takes the short turn");
          applyCameraPose(view, pose);
          assert.ok(camera.up.dot(new THREE.Vector3(...frame.u)) ** 2 > 0.999999);
          assert.deepEqual(frame, unchanged, "Camera roll never changes the plane frame");
        }
      }
    }
  }
});

test("plane orientation ranking is invariant to quaternion sign", () => {
  const camera = new THREE.OrthographicCamera();
  camera.position.set(0, 0, -120);
  camera.up.set(-1, 0.08, 0).normalize();
  const view = { camera, target: new THREE.Vector3(), height: 80 };
  camera.lookAt(view.target);
  const positive = planeCameraPose(view, planes.XY).quaternion;
  // lookAt must preserve the quaternion representative for this sign regression.
  camera.lookAt = () => {};
  const q = camera.quaternion;
  q.set(-q.x, -q.y, -q.z, -q.w);
  const negative = planeCameraPose(view, planes.XY).quaternion;
  assert.ok(positive.angleTo(negative) < 1e-7);
  assert.ok(new THREE.Vector3(0, 1, 0).applyQuaternion(negative).x < -0.999999);
});

test("plane framing carries a region target and orthographic height into one pose", () => {
  const camera = new THREE.OrthographicCamera();
  camera.position.set(55, -70, 65);
  camera.up.set(0, 0, 1);
  const view = { camera, target: new THREE.Vector3(), height: 80 },
    pose = planeCameraPose(view, planes.XY, { target: [30, 22, 0], height: 10 });
  applyCameraPose(view, pose);
  camera.lookAt(view.target);
  camera.updateMatrixWorld();
  assert.deepEqual(view.target.toArray(), [30, 22, 0]);
  assert.equal(view.height, 10);
  assert.ok(Math.abs(camera.position.distanceTo(view.target) - 120) < 1e-9);
  assert.ok(
    new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).dot(new THREE.Vector3(0, 1, 0)) >
      0.999999,
  );
});

test("pan translates camera and target equally; pointer-centered zoom respects limits", () => {
  const camera = new THREE.OrthographicCamera();
  camera.position.set(0, 0, 120);
  camera.up.set(0, 1, 0);
  const view = { camera, target: new THREE.Vector3(), height: 80 };
  camera.lookAt(view.target);
  camera.updateMatrixWorld();
  panCamera(view, 100, 50, 800);
  assert.deepEqual(view.target.toArray(), [-10, 5, 0]);
  assert.deepEqual(camera.position.toArray(), [-10, 5, 120]);
  zoomCamera(view, 0.5, { x: 200, y: -100 }, 800);
  assert.equal(view.height, 40);
  assert.deepEqual(view.target.toArray(), [0, 10, 0]);
  assert.deepEqual(camera.position.toArray(), [0, 10, 120]);
  zoomCamera(view, 1e10, { x: 0, y: 0 }, 800);
  assert.equal(view.height, 10000);
  zoomCamera(view, 1e-10, { x: 0, y: 0 }, 800);
  assert.equal(view.height, 0.5);
});

test("two-finger similarity motion maps both world points to the new finger positions", () => {
  const camera = new THREE.OrthographicCamera(-50, 50, 40, -40);
  camera.position.set(0, 0, 120);
  const view = { camera, target: new THREE.Vector3(), height: 80 };
  camera.lookAt(view.target);
  camera.updateMatrixWorld();
  // Screen starts: (100, 40), (300, 40), relative to viewport center.
  const points = [new THREE.Vector3(10, -4, 0), new THREE.Vector3(30, -4, 0)];
  // Translate midpoint by (20, 30), scale by 1.5, rotate clockwise by 90°.
  panCamera(view, 20, 30, 800);
  zoomCamera(view, 1 / 1.5, { x: 220, y: 70 }, 800);
  rollCamera(view, Math.PI / 2, { x: 220, y: 70 }, 800);
  camera.left = (-view.height * 1.25) / 2;
  camera.right = -camera.left;
  camera.top = view.height / 2;
  camera.bottom = -camera.top;
  camera.updateProjectionMatrix();
  for (let i = 0; i < points.length; i++) {
    const p = points[i].project(camera);
    assert.ok(Math.abs(p.x * 500 - 220) < 1e-8);
    assert.ok(Math.abs(-p.y * 400 - (i === 0 ? -80 : 220)) < 1e-8);
  }
});
