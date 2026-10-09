import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { levelOrientation, SmoothedTurntable } from "../src/sketch/camera-orbit.js";

function tiltedView(pitch: number, roll: number, inverted = false) {
  const camera = new THREE.OrthographicCamera(-40, 40, 40, -40);
  const target = new THREE.Vector3(3, 4, 5);
  const radians = THREE.MathUtils.degToRad(pitch);
  camera.position.copy(target).add(new THREE.Vector3(0, Math.sin(radians), Math.cos(radians)));
  camera.up.set(0, inverted ? -1 : 1, 0);
  camera.lookAt(target);
  camera.quaternion.multiply(
    new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      THREE.MathUtils.degToRad(roll),
    ),
  );
  camera.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
  return { camera, target };
}

function assertUpright(orientation: THREE.Quaternion, axis: THREE.Vector3) {
  const projected = axis.clone().applyQuaternion(orientation.clone().invert());
  assert.ok(Math.abs(projected.x) < 1e-10, "Chosen axis is exactly vertical");
  assert.ok(projected.y > 0, "Chosen sign points toward screen top");
}

test("nearest screen-top end wins over the longer projected axis, including inverted views", () => {
  for (const inverted of [false, true]) {
    for (const roll of [-19, 0, 19]) {
      const state = tiltedView(inverted ? -70 : 70, roll, inverted);
      assertUpright(levelOrientation(state), new THREE.Vector3(0, inverted ? -1 : 1, 0));
    }
  }
});

test("screen-top sign determines depth rather than absolute depth or positive world direction", () => {
  const state = tiltedView(-70, 12);
  assertUpright(levelOrientation(state), new THREE.Vector3(0, 0, 1));
});

test("an end-on axis with quaternion roundoff cannot replace the visible upright axis", () => {
  const state = tiltedView(0, 0);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  state.camera.position.copy(state.target).add(new THREE.Vector3(0, 0, 120).applyQuaternion(q));
  state.camera.up.set(0, 1, 0).applyQuaternion(q);
  assertUpright(levelOrientation(state), new THREE.Vector3(0, 0, -1));
});

test("20 degree boundary is inclusive; outside it the existing fallback chooses the clear axis", () => {
  for (const roll of [-20, 20])
    assertUpright(levelOrientation(tiltedView(70, roll)), new THREE.Vector3(0, 1, 0));
  for (const roll of [-20.01, 20.01, 35])
    assertUpright(levelOrientation(tiltedView(70, roll)), new THREE.Vector3(0, 0, -1));
});

test("after snapping, horizontal movement yaws around the selected axis", () => {
  const state = tiltedView(70, 12);
  const snapped = levelOrientation(state);
  state.camera.up.set(0, 1, 0).applyQuaternion(snapped);
  const before = state.camera.position.clone().sub(state.target);
  const orbit = new SmoothedTurntable();
  orbit.begin(state, { x: 0, y: 0 });
  orbit.drag(state, { x: 0.15, y: 0 });
  const expected = before.applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.3);
  assert.ok(state.camera.position.clone().sub(state.target).distanceTo(expected) < 1e-10);
});

test("the next drag keeps the snapped axis when another axis enters the band after leveling", () => {
  const state = tiltedView(0, 0);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(53 * 0.21, 53 * 0.37, 53 * 0.16));
  state.camera.position.copy(state.target).add(new THREE.Vector3(0, 0, 120).applyQuaternion(q));
  state.camera.up.set(0, 1, 0).applyQuaternion(q);
  const snapped = levelOrientation(state);
  const axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
  const axis = axes.find((candidate) => {
    const p = candidate.clone().applyQuaternion(snapped.clone().invert());
    return Math.abs(p.x) < 1e-10 && Math.abs(p.y) > 1e-8;
  });
  assert.ok(axis);
  if (axis.clone().applyQuaternion(snapped.clone().invert()).y < 0) axis.negate();
  state.camera.up.set(0, 1, 0).applyQuaternion(snapped);
  const before = state.camera.position.clone().sub(state.target);
  const orbit = new SmoothedTurntable();
  orbit.begin(state, { x: 0, y: 0 });
  orbit.drag(state, { x: 0.1, y: 0 });
  assert.ok(
    state.camera.position.clone().sub(state.target).distanceTo(before.applyAxisAngle(axis, -0.2)) <
      1e-10,
  );
});
