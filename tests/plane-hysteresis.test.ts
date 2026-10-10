import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  applicationPreferences,
  configurePreferences,
} from "../src/preferences/application-preferences.js";
import { normalizePlaneSettings } from "../src/preferences/canonical-planes.js";
import { CanonicalPlaneVisibility } from "../src/sketch/canonical-plane-visibility.js";

function orbit(side = 1) {
  const visibility = new CanonicalPlaneVisibility();
  const camera = new THREE.OrthographicCamera();
  return (degrees: number, switchAngleDegrees = 30) => {
    const radians = (degrees * Math.PI) / 180;
    camera.position.set(0, side * Math.cos(radians), side * Math.sin(radians));
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    visibility.update(camera, normalizePlaneSettings({ switchAngleDegrees }), 0, true);
    return Object.entries(visibility.states).find(([, state]) => state.role === "primary")?.[0];
  };
}

test("primary survives ranking boundaries until 30 degrees from its surface, on either side", () => {
  for (const side of [1, -1]) {
    const view = orbit(side);
    assert.equal(view(90), "XY");
    for (const angle of [46, 44, 46, 44, 30.01]) assert.equal(view(angle), "XY");
    assert.equal(view(30), "XZ");
    for (const angle of [30.01, 44, 46, 59.99]) assert.equal(view(angle), "XZ");
    assert.equal(view(60), "XY");
  }
});

test("switch angle changes take effect immediately, with edge-on and always-nearest extremes", () => {
  const view = orbit();
  assert.equal(view(90), "XY");
  assert.equal(view(35, 20), "XY");
  assert.equal(view(35, 40), "XZ");
  assert.equal(view(50, 90), "XY");
  assert.equal(view(40, 90), "XZ");
  assert.equal(view(89, 0), "XZ");
  assert.equal(view(90, 0), "XY");
});

test("switching reuses the most-face-on ranking and canonical tie order", () => {
  const visibility = new CanonicalPlaneVisibility();
  const camera = new THREE.OrthographicCamera();
  const update = (x: number, y: number, z: number) => {
    camera.position.set(x, y, z);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    visibility.update(camera, normalizePlaneSettings(null), 0, true);
  };
  update(0, 0, 1);
  update(1, 2, 0.1);
  assert.equal(visibility.states.XZ.role, "primary");
  update(1, 0, 1);
  assert.equal(visibility.states.XY.role, "primary");
});

test("switch angle defaults, stored normalization and atomic agent validation", () => {
  assert.equal(normalizePlaneSettings({}).switchAngleDegrees, 30);
  assert.equal(normalizePlaneSettings({ switchAngleDegrees: NaN }).switchAngleDegrees, 30);
  assert.equal(normalizePlaneSettings({ switchAngleDegrees: -1 }).switchAngleDegrees, 0);
  assert.equal(normalizePlaneSettings({ switchAngleDegrees: 100 }).switchAngleDegrees, 90);
  const before = applicationPreferences();
  try {
    configurePreferences('{"canonicalPlanes":{"switchAngleDegrees":20}}');
    assert.equal(applicationPreferences().canonicalPlanes.switchAngleDegrees, 20);
    const current = applicationPreferences();
    assert.throws(() =>
      configurePreferences(
        '{"viewDisplay":{"grid":0.1},"canonicalPlanes":{"switchAngleDegrees":91}}',
      ),
    );
    assert.deepEqual(applicationPreferences(), current);
  } finally {
    configurePreferences(JSON.stringify(before));
  }
});
