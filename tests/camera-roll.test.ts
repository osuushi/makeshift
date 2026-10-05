import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { rollCamera } from "../src/sketch/camera-motion.js";
import { levelOrientation } from "../src/sketch/camera-orbit.js";
import { CameraRoll, snappedRoll } from "../src/sketch/camera-roll.js";

import type { World } from "../src/sketch/world.js";

test("quarter-turn destination includes horizon correction without mutating the starting view", () => {
  for (const position of [
    [0, 0, 120],
    [55, -70, 65],
    [-20, 30, -80],
  ]) {
    for (const sign of [-1, 1]) {
      const camera = new THREE.OrthographicCamera(-40, 40, 40, -40);
      camera.position.set(...(position as [number, number, number]));
      const view = { camera, target: new THREE.Vector3(), height: 80 };
      camera.lookAt(view.target);
      camera.updateMatrixWorld();
      const original = camera.quaternion.clone();
      const radians = snappedRoll(view, (sign * Math.PI) / 2);
      assert.ok(camera.quaternion.equals(original));
      assert.equal(Math.sign(radians), sign);
      assert.ok(Math.abs(radians) < Math.PI);
      rollCamera(view, radians, { x: 130, y: -70 }, 850);
      assert.ok(camera.quaternion.angleTo(levelOrientation(view)) < 1e-7);
    }
  }
});

test("animation starts without a jump and follows monotonic easing at uneven frame times", (t) => {
  const previous = {
    request: globalThis.requestAnimationFrame,
    cancel: globalThis.cancelAnimationFrame,
    media: globalThis.matchMedia,
  };
  const frames = new Map<number, FrameRequestCallback>();
  globalThis.requestAnimationFrame = (callback) => {
    frames.set(1, callback);
    return 1;
  };
  globalThis.cancelAnimationFrame = () => {
    frames.delete(1);
  };
  globalThis.matchMedia = (() => ({ matches: false })) as unknown as typeof matchMedia;
  t.mock.method(performance, "now", () => 1000);
  t.after(() => {
    globalThis.requestAnimationFrame = previous.request;
    globalThis.cancelAnimationFrame = previous.cancel;
    globalThis.matchMedia = previous.media;
  });
  const camera = new THREE.OrthographicCamera(-40, 40, 40, -40);
  camera.position.set(0, 0, 120);
  const view = {
    camera,
    target: new THREE.Vector3(),
    height: 80,
    navigation: { begin: () => {} },
    cancelCameraMotion: () => animation.cancel(),
    requestDraw: () => {},
  };
  const animation = new CameraRoll(view as unknown as World);
  animation.start(Math.PI / 2, { x: 100, y: -50 }, 850);
  assert.deepEqual(camera.up.toArray(), [0, 1, 0], "Starting the gesture does not jump");
  for (const elapsed of [0, 8, 35, 75, 110, 190, 250, 280, 350]) {
    const step = frames.get(1);
    frames.delete(1);
    step?.(1000 + elapsed);
    const expected = (Math.PI / 2) * (1 - (1 - Math.min(1, elapsed / 280)) ** 3);
    assert.ok(Math.abs(Math.atan2(-camera.up.x, camera.up.y) - expected) < 1e-10);
  }
  assert.equal(animation.active, false);
});
