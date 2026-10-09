import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { levelOrientation, SmoothedTurntable } from "../src/sketch/camera-orbit.js";

function view() {
  const camera = new THREE.OrthographicCamera(-40, 40, 40, -40);
  const target = new THREE.Vector3(3, 4, 5);
  camera.position.copy(target).add(new THREE.Vector3(0, 0, 120));
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  return { camera, target };
}
test("turntable uses starting pose independent of intervening events and reverses exactly", () => {
  const a = view(),
    b = view(),
    first = new SmoothedTurntable(),
    second = new SmoothedTurntable();
  const start = { x: 0.1, y: -0.4 },
    end = { x: 0.6, y: 0.2 };
  const original = a.camera.position.clone();
  first.begin(a, start);
  second.begin(b, start);
  first.drag(a, { x: -0.9, y: 0.2 });
  first.drag(a, end);
  second.drag(b, end);
  assert.ok(a.camera.position.distanceTo(b.camera.position) < 1e-10);
  assert.ok(a.camera.up.distanceTo(b.camera.up) < 1e-10);
  assert.ok(Math.abs(a.camera.position.distanceTo(a.target) - 120) < 1e-10);
  assert.deepEqual(a.target.toArray(), [3, 4, 5]);
  first.drag(a, start);
  assert.ok(a.camera.position.distanceTo(original) < 1e-10);
  first.end();
  first.drag(a, end);
  assert.ok(a.camera.position.distanceTo(original) < 1e-10);
});
test("center drags yaw and pitch without tilting the horizon before release", () => {
  const state = view(),
    orbit = new SmoothedTurntable();
  orbit.begin(state, { x: 0, y: 0 });
  orbit.drag(state, { x: 0.3, y: 0.2 });
  state.camera.lookAt(state.target);
  const upright = new THREE.Vector3(0, 1, 0).applyQuaternion(
    state.camera.quaternion.clone().invert(),
  );
  assert.ok(Math.abs(upright.x) < 1e-10, "World up stays vertical while dragging");
  assert.ok(state.camera.position.x < state.target.x, "Horizontal motion yaws");
  assert.ok(state.camera.position.y < state.target.y, "Vertical motion pitches");
  assert.ok(state.camera.quaternion.angleTo(levelOrientation(state)) < 1e-10);
});
test("two center drags turn the view through 180 degrees", () => {
  const state = view(),
    orbit = new SmoothedTurntable();
  for (let i = 0; i < 2; i++) {
    orbit.begin(state, { x: 0, y: 0 });
    orbit.drag(state, { x: Math.PI / 4, y: 0 });
    orbit.end();
  }
  assert.ok(Math.abs(state.camera.position.x - state.target.x) < 1e-10);
  assert.ok(Math.abs(state.camera.position.z - state.target.z + 120) < 1e-10);
});
test("explicit roll follows pointer angle one-to-one and preserves view direction", () => {
  const state = view(),
    orbit = new SmoothedTurntable();
  const position = state.camera.position.clone(),
    target = state.target.clone();
  orbit.begin(state, { x: 1, y: 0 }, new THREE.Vector3(20, 10, 0), true);
  orbit.drag(state, { x: 0, y: -1 }, true);
  assert.ok(state.camera.position.distanceTo(position) < 1e-10);
  assert.ok(state.target.distanceTo(target) < 1e-10);
  assert.ok(state.camera.up.distanceTo(new THREE.Vector3(-1, 0, 0)) < 1e-10);
  orbit.drag(state, { x: 1, y: 0 }, true);
  assert.ok(state.camera.up.distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-10);
});
test("release orientation is an exact signed canonical horizon, preserving view direction", () => {
  for (let i = 0; i < 40; i++) {
    const state = view();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(i * 0.21, i * 0.37, i * 0.16));
    state.camera.position.sub(state.target).applyQuaternion(q).add(state.target);
    state.camera.up.applyQuaternion(q);
    state.camera.lookAt(state.target);
    const before = state.camera.quaternion.clone(),
      after = levelOrientation(state);
    const forward = new THREE.Vector3(0, 0, 1);
    assert.ok(
      forward.clone().applyQuaternion(before).distanceTo(forward.clone().applyQuaternion(after)) <
        1e-10,
    );
    const axes = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1),
    ];
    assert.ok(
      axes.some((axis) => {
        const p = axis.clone().applyQuaternion(after.clone().invert());
        return Math.hypot(p.x, p.y) > 1e-6 && Math.abs(p.x) < 1e-10;
      }),
    );
  }
});

test("a foreshortened vertical axis wins when its screen-top end is nearest", () => {
  const state = view();
  state.camera.position
    .copy(state.target)
    .add(new THREE.Vector3(0.03, 0.995, 0.1).normalize().multiplyScalar(120));
  state.camera.up.set(0, 1, 0);
  state.camera.lookAt(state.target);
  const before = state.camera.quaternion.clone();
  const after = levelOrientation(state);
  const projectedY = new THREE.Vector3(0, 1, 0).applyQuaternion(after.clone().invert());
  for (const component of ["x", "y", "z", "w"] as const)
    assert.ok(Math.abs(before[component] - after[component]) < 1e-10);
  assert.ok(Math.abs(projectedY.x) < 1e-10, "Y stays exactly vertical");
});
test("a clear already-level horizon stays put, including an exactly end-on other axis", () => {
  const state = view();
  const before = state.camera.quaternion.clone();
  assert.ok(before.angleTo(levelOrientation(state)) < 1e-10);
});

test("the same orbit displacement works at the center and every viewport edge", () => {
  const baseline = view(),
    first = new SmoothedTurntable();
  first.begin(baseline, { x: 0, y: 0 });
  first.drag(baseline, { x: 0.1, y: 0.2 });
  for (const start of [
    { x: -2, y: 0 },
    { x: 2, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ]) {
    const state = view(),
      orbit = new SmoothedTurntable();
    orbit.begin(state, start);
    orbit.drag(state, { x: start.x + 0.1, y: start.y + 0.2 });
    assert.ok(state.camera.position.distanceTo(baseline.camera.position) < 1e-10);
    assert.ok(state.camera.up.distanceTo(baseline.camera.up) < 1e-10);
  }
});
test("changing the roll modifier rebases without jumping or reacquiring the orbit pivot", () => {
  const state = view(),
    orbit = new SmoothedTurntable();
  const pivot = new THREE.Vector3(23, -7, -30);
  orbit.begin(state, { x: 0, y: 0 }, pivot);
  const at = { x: 0.2, y: -0.1 };
  orbit.drag(state, at);
  const position = state.camera.position.clone(),
    up = state.camera.up.clone();
  orbit.drag(state, at, true);
  assert.ok(state.camera.position.distanceTo(position) < 1e-10);
  assert.ok(state.camera.up.distanceTo(up) < 1e-10);
  orbit.drag(state, { x: 0.5, y: -0.1 }, true);
  state.camera.lookAt(state.target);
  state.camera.updateMatrixWorld();
  const projected = pivot.clone().project(state.camera);
  orbit.drag(state, { x: 0.5, y: -0.1 });
  orbit.drag(state, { x: 0.6, y: 0.1 });
  state.camera.lookAt(state.target);
  state.camera.updateMatrixWorld();
  assert.ok(pivot.clone().project(state.camera).distanceTo(projected) < 1e-10);
});

test("off-center pivot stays at its screen position without a starting jump", () => {
  const state = view(),
    orbit = new SmoothedTurntable();
  const pivot = new THREE.Vector3(23, -7, -30);
  state.camera.updateMatrixWorld();
  const projected = pivot.clone().project(state.camera);
  const originalPosition = state.camera.position.clone(),
    originalTarget = state.target.clone();
  const start = { x: 0.2, y: -0.4 };
  orbit.begin(state, start, pivot);
  assert.ok(state.camera.position.equals(originalPosition));
  assert.ok(state.target.equals(originalTarget));
  orbit.drag(state, { x: -0.4, y: 0.3 });
  state.camera.lookAt(state.target);
  state.camera.updateMatrixWorld();
  assert.ok(pivot.clone().project(state.camera).distanceTo(projected) < 1e-10);
  assert.ok(state.target.distanceTo(originalTarget) > 1);
  orbit.drag(state, start);
  assert.ok(state.camera.position.distanceTo(originalPosition) < 1e-10);
  assert.ok(state.target.distanceTo(originalTarget) < 1e-10);
});

test("selected roll pivot stays fixed in a wide viewport and uses its projected angle", () => {
  const state = view(),
    orbit = new SmoothedTurntable();
  state.camera.left = -80;
  state.camera.right = 80;
  state.camera.updateProjectionMatrix();
  state.camera.updateMatrixWorld();
  const pivot = new THREE.Vector3(23, -7, 5);
  const projected = pivot.clone().project(state.camera);
  const center = { x: projected.x * 2, y: projected.y };
  orbit.begin(state, { x: center.x + 1, y: center.y }, state.target, true, pivot);
  orbit.drag(state, { x: center.x, y: center.y - 1 }, true);
  state.camera.lookAt(state.target);
  state.camera.updateMatrixWorld();
  assert.ok(state.camera.up.distanceTo(new THREE.Vector3(-1, 0, 0)) < 1e-10);
  assert.ok(pivot.clone().project(state.camera).distanceTo(projected) < 1e-10);
});
test("angular roll crosses the opposite bearing, completes a circle, and reverses", () => {
  const state = view(),
    orbit = new SmoothedTurntable();
  const point = (angle: number) => ({ x: Math.cos(angle), y: -Math.sin(angle) });
  orbit.begin(state, point(0), state.target, true);
  const path = [Math.PI / 2, Math.PI - 0.001, Math.PI + 0.001, (3 * Math.PI) / 2, 2 * Math.PI];
  for (const angle of [...path, ...path.slice().reverse(), 0]) {
    orbit.drag(state, point(angle), true);
    assert.ok(
      state.camera.up.distanceTo(new THREE.Vector3(-Math.sin(angle), Math.cos(angle), 0)) < 1e-9,
    );
  }
});
test("radial travel and crossing the roll center cannot flip the camera", () => {
  const state = view(),
    orbit = new SmoothedTurntable();
  orbit.begin(state, { x: -1, y: 0 }, state.target, true);
  for (const point of [
    { x: -0.5, y: 0 },
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ]) {
    orbit.drag(state, point, true);
    assert.ok(state.camera.up.distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-10);
  }
  orbit.drag(state, { x: 0, y: -1 }, true);
  assert.ok(state.camera.up.distanceTo(new THREE.Vector3(-1, 0, 0)) < 1e-10);
});

test("cube-centered bearing controls roll independently of a selected model pivot", () => {
  const state = view(),
    orbit = new SmoothedTurntable();
  const pivot = new THREE.Vector3(2, 1, 0);
  state.camera.updateMatrixWorld();
  const projected = pivot.clone().project(state.camera);
  orbit.begin(state, { x: 0.5, y: 0, rollCenter: { x: 0, y: 0 } }, state.target, true, pivot);
  orbit.drag(state, { x: 1, y: 0, rollCenter: { x: 0, y: 0 } }, true);
  assert.ok(state.camera.up.distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-10);
  orbit.drag(state, { x: 0, y: -1, rollCenter: { x: 0, y: 0 } }, true);
  assert.ok(state.camera.up.distanceTo(new THREE.Vector3(-1, 0, 0)) < 1e-10);
  state.camera.lookAt(state.target);
  state.camera.updateMatrixWorld();
  assert.ok(pivot.clone().project(state.camera).distanceTo(projected) < 1e-10);
});
