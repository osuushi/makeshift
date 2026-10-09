import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { applyCameraPose } from "../src/sketch/camera-motion.js";
import {
  levelOrientation,
  orbitReleaseOrientation,
  SmoothedTurntable,
} from "../src/sketch/camera-orbit.js";
import { CameraTransition } from "../src/sketch/camera-transition.js";
import type { World } from "../src/sketch/world.js";

function handoff(inverted = false, yaw = 0.15) {
  const camera = new THREE.OrthographicCamera(-40, 40, 40, -40);
  const target = new THREE.Vector3(3, 4, 5);
  camera.position.copy(target).add(new THREE.Vector3(0, 0, 120));
  camera.up.set(0, inverted ? -1 : 1, 0);
  const view = { camera, target, height: 80 };
  const orbit = new SmoothedTurntable();
  const pivot = new THREE.Vector3(23, -7, -30);
  orbit.begin(view, { x: 0, y: 0 }, pivot);
  orbit.drag(view, { x: yaw, y: 0.6 });
  camera.lookAt(target);
  camera.updateMatrixWorld();
  const frame = orbit.releaseFrame;
  assert.ok(frame);
  return { view, orbit, frame };
}
function projected(axis: THREE.Vector3, orientation: THREE.Quaternion) {
  return axis.clone().applyQuaternion(orientation.clone().invert());
}

test("handoff aligns old and new axes vertically, retaining the previous screen-up sign", () => {
  for (const inverted of [false, true]) {
    for (const yaw of [-0.4, -0.15, 0.15, 0.4]) {
      const { view, frame } = handoff(inverted, yaw);
      const before = new THREE.Vector3(0, 0, 1).applyQuaternion(view.camera.quaternion);
      const orientation = orbitReleaseOrientation(view, frame.axis);
      const nextAxis =
        Math.abs(yaw) > 0.3
          ? new THREE.Vector3(Math.sign(before.x), 0, 0)
          : new THREE.Vector3(0, 0, 1);
      for (const axis of [frame.axis, nextAxis]) {
        const p = projected(axis, orientation);
        assert.ok(Math.abs(p.x) < 1e-10 && p.y > 0);
      }
      const direction = new THREE.Vector3(0, 0, 1).applyQuaternion(orientation);
      const expected =
        Math.abs(yaw) > 0.3
          ? before.clone().setZ(0).normalize()
          : before.clone().setX(0).normalize();
      assert.ok(direction.distanceTo(expected) < 1e-10, "Remove only out-of-plane skew");
      assert.ok(projected(nextAxis, orientation).z > 0);
      applyCameraPose(view, {
        target: view.target.clone(),
        quaternion: orientation,
        distance: 120,
        height: 80,
      });
      const beforeYaw = view.camera.position.clone().sub(view.target);
      const next = new SmoothedTurntable();
      next.begin(view, { x: 0, y: 0 });
      next.drag(view, { x: 0.1, y: 0 });
      assert.ok(
        view.camera.position
          .clone()
          .sub(view.target)
          .distanceTo(beforeYaw.applyAxisAngle(nextAxis, -0.2)) < 1e-10,
        "Next drag yaws around the new above-plane axis",
      );
    }
  }
});

test("handoff works with every signed canonical previous axis", () => {
  for (const inverted of [false, true])
    for (let quarter = 0; quarter < 3; quarter++) {
      const { view, frame } = handoff(inverted);
      const rotation = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 1, 1).normalize(),
        (quarter * 2 * Math.PI) / 3,
      );
      view.camera.position.sub(view.target).applyQuaternion(rotation).add(view.target);
      view.camera.up.applyQuaternion(rotation);
      frame.axis.applyQuaternion(rotation);
      const next = new THREE.Vector3(0, 0, 1).applyQuaternion(rotation);
      const q = orbitReleaseOrientation(view, frame.axis);
      for (const axis of [frame.axis, next]) {
        const p = projected(axis, q);
        assert.ok(Math.abs(p.x) < 1e-10 && p.y > 0);
      }
      assert.ok(projected(next, q).z > 0);
    }
});

test("roll modifier rebasing retains the gesture's prior orbit axis", () => {
  const { view, orbit, frame } = handoff();
  orbit.drag(view, { x: 0.15, y: 0.6 }, true);
  assert.deepEqual(orbit.releaseFrame?.axis.toArray(), frame.axis.toArray());
  orbit.drag(view, { x: 0.15, y: 0.6 }, false);
  assert.deepEqual(orbit.releaseFrame?.axis.toArray(), frame.axis.toArray());
  orbit.end();
  assert.equal(orbit.releaseFrame, null, "Cancellation leaves no stale snap frame");
});

test("same-axis and undefined two-axis-plane cases retain ordinary leveling", () => {
  const { view } = handoff();
  const leveled = levelOrientation(view);
  assert.ok(leveled.angleTo(orbitReleaseOrientation(view, new THREE.Vector3(0, 0, 1))) < 1e-7);
  view.camera.position.copy(view.target).add(new THREE.Vector3(0, 0, 120));
  view.camera.up.set(0, 1, 0);
  assert.ok(
    levelOrientation(view).angleTo(orbitReleaseOrientation(view, new THREE.Vector3(1, 0, 0))) <
      1e-7,
  );
});

for (const reduced of [false, true]) {
  test(`handoff animation keeps the old axis vertical and pivot fixed (reduced=${reduced})`, (t) => {
    const request = globalThis.requestAnimationFrame,
      cancel = globalThis.cancelAnimationFrame,
      media = globalThis.matchMedia;
    const frames = new Map<number, FrameRequestCallback>();
    globalThis.requestAnimationFrame = (callback) => {
      frames.set(1, callback);
      return 1;
    };
    globalThis.cancelAnimationFrame = () => {
      frames.delete(1);
    };
    globalThis.matchMedia = (() => ({ matches: reduced })) as unknown as typeof matchMedia;
    t.mock.method(performance, "now", () => 1000);
    t.after(() => {
      globalThis.requestAnimationFrame = request;
      globalThis.cancelAnimationFrame = cancel;
      globalThis.matchMedia = media;
    });
    const { view, frame } = handoff();
    const fixed = frame.pivot.clone().project(view.camera);
    const world = Object.assign(view, {
      cancelCameraMotion: () => transition.cancel(),
      draw: () => {},
    });
    const transition = new CameraTransition(world as unknown as World);
    let completed = 0;
    transition.start(
      {
        target: view.target.clone(),
        quaternion: orbitReleaseOrientation(view, frame.axis),
        distance: view.camera.position.distanceTo(view.target),
        height: 80,
      },
      () => completed++,
      frame,
    );
    for (const elapsed of [0, 8, 35, 75, 110, 190, 250, 280]) {
      const step = frames.get(1);
      frames.delete(1);
      step?.(1000 + elapsed);
      const p = projected(frame.axis, view.camera.quaternion);
      assert.ok(Math.abs(p.x) < 1e-10 && p.y > 0, "Previous axis stays vertical throughout");
      assert.ok(frame.pivot.clone().project(view.camera).distanceTo(fixed) < 1e-10);
      assert.equal(view.height, 80);
    }
    assert.equal(completed, 1);
    assert.equal(transition.active, false);
  });
}
