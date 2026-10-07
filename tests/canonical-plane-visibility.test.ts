import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  applicationPreferences,
  configurePreferences,
} from "../src/preferences/application-preferences.js";
import {
  canonicalPlanes,
  normalizePlaneSettings,
  planePresets,
} from "../src/preferences/canonical-planes.js";
import { canonicalPlaneBounds, planeViewCenter } from "../src/sketch/canonical-plane-bounds.js";
import {
  CanonicalPlaneVisibility,
  mixPlaneVisibility,
  planeVisibilityTarget,
  selectablePlane,
} from "../src/sketch/canonical-plane-visibility.js";
import { planes } from "../src/sketch/planes.js";
import type { World } from "../src/sketch/world.js";

const settings = canonicalPlanes();
test("angle boundaries, both sides, head-on maximum and optional preview jump", () => {
  assert.equal(planeVisibilityTarget(settings.angleCutoff, settings), 0);
  assert.equal(planeVisibilityTarget(1, settings), 1);
  assert.equal(planeVisibilityTarget(-1, settings), 1);
  assert.ok(
    Math.abs(planeVisibilityTarget(settings.angleCutoff + settings.fadeWidth / 2, settings) - 0.5) <
      1e-12,
  );
  assert.equal(planeVisibilityTarget(1, { ...settings, fadeWidth: 1 }), 1);
  assert.equal(planeVisibilityTarget(0.5, { ...settings, fadeWidth: 0 }), 1);
  assert.equal(planeVisibilityTarget(0.5, { ...settings, fullOpacityAbove: 0 }), 1);
  assert.equal(planeVisibilityTarget(0.62, { ...settings, fullOpacityAbove: 0.4 }), 1);
  assert.equal(planeVisibilityTarget(1, { ...settings, angleCutoff: 1 }), 0);
});
test("faint previews cannot click, including a still-bright plane fading out", () => {
  assert.equal(selectablePlane(0.01, 1, 0.15), false);
  assert.equal(selectablePlane(1, 0.01, 0.15), false);
  assert.equal(selectablePlane(0.15, 0.15, 0.15), true);
  assert.equal(selectablePlane(0, 1, 0), false);
  assert.equal(selectablePlane(0.001, 0.001, 0), true);
  assert.equal(selectablePlane(0.99, 1, 1), false);
});
test("smooth mixing is frame-rate independent, settles and honors instant changes", () => {
  const half = mixPlaneVisibility(0, 1, 60, 120);
  assert.ok(
    Math.abs(mixPlaneVisibility(half, 1, 60, 120) - mixPlaneVisibility(0, 1, 120, 120)) < 1e-12,
  );
  assert.equal(mixPlaneVisibility(0, 1, 120, 0), 1);
  assert.equal(mixPlaneVisibility(1, 0, 200, 120), 0);
});
test("presets encourage one/two references; head-on and isometric views remain natural", () => {
  const camera = new THREE.OrthographicCamera();
  const visibility = new CanonicalPlaneVisibility();
  camera.position.set(0, 0, 50);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  visibility.update(camera, settings, 0, true);
  assert.deepEqual(
    Object.values(visibility.states).map((s) => s.selectable),
    [true, false, false],
  );
  camera.position.set(1, 1, 1);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  visibility.update(camera, settings, 10, true);
  assert.ok(Object.values(visibility.states).every((s) => s.selectable));
  const direction = [0.9, 0.4, Math.sqrt(0.03)];
  assert.equal(
    direction.filter((d) => planeVisibilityTarget(d, settings) >= settings.selectableMinimum)
      .length,
    1,
  );
  assert.equal(
    direction.filter(
      (d) =>
        planeVisibilityTarget(d, { ...settings, ...planePresets.choice }) >=
        settings.selectableMinimum,
    ).length,
    2,
  );
});
test("stored settings recover malformed fields and preserve valid palettes", () => {
  const normalized = normalizePlaneSettings({
    angleCutoff: NaN,
    fadeWidth: -1,
    fadeMilliseconds: 9000,
    colors: { XY: "bad" },
    palettes: { Mine: { XY: "#123456" } },
  });
  assert.equal(normalized.angleCutoff, 0.45);
  assert.equal(normalized.fadeWidth, 0);
  assert.equal(normalized.fadeMilliseconds, 2000);
  assert.equal(normalized.colors.XY, settings.colors.XY);
  assert.equal(normalized.palettes.Mine.XY, "#123456");
});
test("agent settings validate atomically and return independent snapshots", () => {
  const before = applicationPreferences();
  assert.throws(() =>
    configurePreferences(
      JSON.stringify({ viewDisplay: { planes: 0.2 }, canonicalPlanes: { fadeWidth: -1 } }),
    ),
  );
  assert.deepEqual(applicationPreferences(), before);
  assert.throws(() => configurePreferences('{"canonicalPlanes":{"unknown":1}}'));
  assert.throws(() => configurePreferences('{"canonicalPlanes":{"colors":{"XY":"red"}}}'));
  configurePreferences('{"canonicalPlanes":{"angleCutoff":0.5},"viewDisplay":{"planes":0.04}}');
  assert.equal(applicationPreferences().canonicalPlanes.angleCutoff, 0.5);
  assert.equal(applicationPreferences().viewDisplay.planes, 0);
  configurePreferences(JSON.stringify(before));
});

test("changing a target after an idle viewport still starts a temporal fade", () => {
  const camera = new THREE.OrthographicCamera();
  camera.position.set(0, 0, 50);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const visibility = new CanonicalPlaneVisibility();
  visibility.update(camera, settings, 0);
  assert.equal(visibility.states.XY.opacity, 1);
  camera.position.set(50, 0, 0);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  assert.equal(visibility.update(camera, settings, 10000), true);
  assert.equal(visibility.states.XY.opacity, 1);
  assert.equal(visibility.states.XY.selectable, false);
  visibility.update(camera, settings, 10016);
  assert.ok(visibility.states.XY.opacity > 0 && visibility.states.XY.opacity < 1);
});

test("panned oblique views center full-view plane bounds on the actual viewing ray", () => {
  const target = new THREE.Vector3(1000, 2000, 3000);
  const camera = new THREE.OrthographicCamera(-80, 80, 40, -40);
  camera.position.copy(target).add(new THREE.Vector3(50, 50, 50));
  camera.lookAt(target);
  camera.updateMatrixWorld();
  const center = planeViewCenter(camera, target, planes.XY);
  assert.ok(center.distanceTo(new THREE.Vector3(-2000, -1000, 0)) < 1e-8);
  const world = {
    camera,
    target,
    height: 80,
    canvas: { clientWidth: 1280, clientHeight: 850 },
  } as World;
  const bounds = canonicalPlaneBounds(world, planes.XY);
  assert.ok(bounds.minX < center.x && bounds.maxX > center.x);
  assert.ok(bounds.minY < center.y && bounds.maxY > center.y);
});

test("slow rendered frames continue fading instead of remaining permanently unsettled", () => {
  const camera = new THREE.OrthographicCamera();
  camera.position.set(0, 0, 50);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const visibility = new CanonicalPlaneVisibility();
  visibility.update(camera, settings, 0);
  camera.position.set(50, 0, 0);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  visibility.update(camera, settings, 10000);
  assert.equal(visibility.states.XY.opacity, 1);
  visibility.update(camera, settings, 10200);
  assert.equal(visibility.states.XY.opacity, 0);
  assert.equal(visibility.states.YZ.opacity, 1);
});

test("grid thickness validation is atomic and fill opacity stays disabled", () => {
  const original = applicationPreferences();
  configurePreferences('{"viewDisplay":{"gridLineWidth":2.5,"planes":0.9}}');
  assert.equal(applicationPreferences().viewDisplay.gridLineWidth, 2.5);
  assert.equal(applicationPreferences().viewDisplay.planes, 0);
  assert.throws(() => configurePreferences('{"viewDisplay":{"grid":0.1,"gridLineWidth":0.4}}'));
  assert.equal(applicationPreferences().viewDisplay.grid, original.viewDisplay.grid);
  configurePreferences(JSON.stringify(original));
});
