import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { configurePreferences } from "../src/preferences/application-preferences.js";
import { canonicalPlanes, normalizePlaneSettings } from "../src/preferences/canonical-planes.js";
import { CanonicalPlaneVisibility } from "../src/sketch/canonical-plane-visibility.js";
import { dampPlaneOpacity } from "../src/sketch/damped-plane-opacity.js";

test("opacity spring retains frame-rate independence, velocity and a perceptible handoff", () => {
  const first = dampPlaneOpacity(0, 0, 1, 120, 240);
  const second = dampPlaneOpacity(first.opacity, first.velocity, 1, 120, 240);
  const whole = dampPlaneOpacity(0, 0, 1, 240, 240);
  assert.ok(Math.abs(second.opacity - whole.opacity) < 1e-12);
  assert.ok(Math.abs(second.velocity - whole.velocity) < 1e-12);
  assert.ok(first.opacity > 0.2 && first.opacity < 0.3);
  assert.ok(whole.opacity > 0.5 && whole.opacity < 0.7);
  assert.deepEqual(dampPlaneOpacity(0, 0, 1, 2000, 240), { opacity: 1, velocity: 0 });
  assert.deepEqual(dampPlaneOpacity(0.4, 0.001, 1, 16, 0), { opacity: 1, velocity: 0 });
  const retargeted = dampPlaneOpacity(first.opacity, first.velocity, 0.35, 0, 240);
  assert.equal(retargeted.opacity, first.opacity);
  assert.equal(retargeted.velocity, first.velocity);
});

test("secondary opacity controls only the secondary target and accepts zero", () => {
  const camera = new THREE.OrthographicCamera();
  camera.position.set(1, 0.8, 0.3);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const visibility = new CanonicalPlaneVisibility();
  const settings = canonicalPlanes();
  for (const secondaryOpacity of [0, 0.35, 0.7, 1]) {
    visibility.update(camera, { ...settings, secondaryOpacity }, 0, true);
    assert.equal(visibility.states.YZ.opacity, 1);
    assert.equal(visibility.states.XZ.opacity, secondaryOpacity);
    assert.equal(visibility.states.XY.opacity, 0);
    assert.equal(visibility.states.XZ.selectable, false);
  }
});

test("legacy default migrates without replacing custom fade or secondary settings", () => {
  assert.equal(normalizePlaneSettings({ fadeMilliseconds: 120 }).fadeMilliseconds, 240);
  assert.equal(normalizePlaneSettings({ fadeMilliseconds: 500 }).fadeMilliseconds, 500);
  const custom = normalizePlaneSettings({ fadeMilliseconds: 120, secondaryOpacity: 0.8 });
  assert.equal(custom.fadeMilliseconds, 120);
  assert.equal(custom.secondaryOpacity, 0.8);
  assert.throws(() => configurePreferences('{"canonicalPlanes":{"secondaryOpacity":1.1}}'));
});
