import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  applicationPreferences,
  configurePreferences,
} from "../src/preferences/application-preferences.js";
import { canonicalPlanes, normalizePlaneSettings } from "../src/preferences/canonical-planes.js";
import {
  canonicalPlaneBounds,
  canonicalPlaneSelectable,
  planeViewCenter,
} from "../src/sketch/canonical-plane-bounds.js";
import {
  CanonicalPlaneVisibility,
  planeVisibilityTarget,
  selectablePlane,
} from "../src/sketch/canonical-plane-visibility.js";
import { coordinateDepthOpacity } from "../src/sketch/coordinate-plane-depth.js";
import { planes } from "../src/sketch/planes.js";
import type { World } from "../src/sketch/world.js";
import { gridMaterial } from "../src/sketch/world-grid-material.js";

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
test("one full-strength primary wins by facing angle, with a bounded secondary and stable ties", () => {
  const camera = new THREE.OrthographicCamera();
  const visibility = new CanonicalPlaneVisibility();
  const cases = [
    [[0, 0, 1], "XY"],
    [[0, 1, 0], "XZ"],
    [[1, 0, 0], "YZ"],
    [[1, 1, 1], "XY"],
    [[-1, -1, -1], "XY"],
    [[0, 1, 1], "XY"],
    [[1, 0, 1], "XY"],
    [[1, 1, 0], "XZ"],
    [[0.9, 0.4, Math.sqrt(0.03)], "YZ"],
    [[1, 1, 1.000001], "XY"],
    [[1, 1.000001, 1], "XZ"],
    [[1.000001, 1, 1], "YZ"],
  ] as const;
  for (const [direction, winner] of cases) {
    camera.position.set(direction[0], direction[1], direction[2]);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    visibility.update(camera, settings, 0, true);
    assert.equal(visibility.states[winner].opacity, 1);
    assert.equal(Object.values(visibility.states).filter((state) => state.target === 1).length, 1);
    assert.ok(
      Object.values(visibility.states)
        .filter((state) => state.role !== "primary")
        .every((state) => state.opacity >= 0 && state.opacity <= settings.secondaryOpacity),
    );
    assert.ok(Object.values(visibility.states).filter((state) => state.opacity > 0).length <= 2);
    assert.deepEqual(
      Object.entries(visibility.states)
        .filter(([, state]) => state.role === "primary")
        .map(([id]) => id),
      [winner],
    );
    assert.deepEqual(
      Object.entries(visibility.states)
        .filter(([, state]) => state.selectable)
        .map(([id]) => id),
      [winner],
    );
  }
});
test("a winner change crossfades smoothly and immediately disables outgoing picking", () => {
  const camera = new THREE.OrthographicCamera();
  const visibility = new CanonicalPlaneVisibility();
  camera.position.set(0, 0, 1);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  visibility.update(camera, settings, 0);
  camera.position.set(0, 1, 0);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  visibility.update(camera, settings, 16);
  assert.ok(visibility.states.XY.opacity > 0 && visibility.states.XY.opacity < 1);
  assert.ok(visibility.states.XZ.opacity > 0 && visibility.states.XZ.opacity < 1);
  assert.ok(Math.abs(visibility.states.XY.opacity + visibility.states.XZ.opacity - 1) < 1e-12);
  assert.equal(visibility.states.XY.selectable, false);
  assert.equal(visibility.states.YZ.opacity, 0);
  visibility.update(camera, settings, 2000);
  assert.equal(visibility.states.XY.opacity, 0);
  assert.equal(visibility.states.XZ.opacity, 1);
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
  assert.ok(visibility.states.XY.opacity > 0 && visibility.states.XY.opacity < 1);
  assert.ok(visibility.states.YZ.opacity > 0 && visibility.states.YZ.opacity < 1);
  visibility.update(camera, settings, 12000);
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

test("secondary references are selectable only inside explicit plane picking", () => {
  const camera = new THREE.OrthographicCamera();
  camera.position.set(1, 0.8, 0.3);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const visibility = new CanonicalPlaneVisibility();
  visibility.update(camera, settings, 0, true);
  const world = {
    canonicalVisibility: visibility,
    active: null,
    planePicker: null,
    planePickerAccept: null,
  } as unknown as World;
  assert.equal(canonicalPlaneSelectable(world, "YZ"), true);
  assert.equal(canonicalPlaneSelectable(world, "XZ"), false);
  world.planePicker = () => {};
  assert.equal(canonicalPlaneSelectable(world, "XZ"), true);
  assert.equal(canonicalPlaneSelectable(world, "XY"), false);
  Object.assign(world, { active: "XY" });
  assert.equal(canonicalPlaneSelectable(world, "XZ"), false);
});

test("coordinate depth fading preserves nearer portions and scales with view height and ignores camera retreat", () => {
  assert.equal(coordinateDepthOpacity(-100000), 1);
  assert.equal(coordinateDepthOpacity(0), 1);
  assert.ok(coordinateDepthOpacity(200) < 1);
  assert.ok(coordinateDepthOpacity(200) > 0.65);
  assert.equal(coordinateDepthOpacity(Infinity), 0.65);
  const center = new THREE.Vector3(10, 20, 30);
  const point = new THREE.Vector3(10, 20, -170);
  const camera = new THREE.OrthographicCamera();
  const opacity = (distance: number, zoom: number) => {
    camera.position.copy(center).add(new THREE.Vector3(0, 0, distance));
    camera.zoom = zoom;
    camera.lookAt(center);
    camera.updateMatrixWorld();
    return coordinateDepthOpacity(
      point.clone().sub(center).dot(camera.getWorldDirection(new THREE.Vector3())),
    );
  };
  assert.equal(opacity(100, 1), opacity(10000, 4));
  assert.equal(coordinateDepthOpacity(200, 80), coordinateDepthOpacity(2000, 800));
});

test("coordinate grids receive depth fading while the active work grid stays unfaded", () => {
  const coordinate = gridMaterial("XY");
  const work = gridMaterial("work");
  assert.equal(coordinate.uniforms.coordinateDepthEnabled.value, 1);
  assert.equal(work.uniforms.coordinateDepthEnabled.value, 0);
  assert.equal(coordinate.depthTest, true);
  assert.equal(work.depthTest, false);
  coordinate.dispose();
  work.dispose();
});
