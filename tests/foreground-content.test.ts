import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { foregroundBodyLayer, hasForegroundContent } from "../src/sketch/world-foreground.js";
import { planarOnlyWorkspace } from "../src/sketch/xray-composite.js";

test("Empty sketches and hidden body groups need no foreground pass; visible bodies do", () => {
  const scene = new THREE.Scene();
  const light = new THREE.HemisphereLight();
  light.layers.enable(foregroundBodyLayer);
  scene.add(light, new THREE.Group());
  const overlays = new Set<never>();
  assert.equal(hasForegroundContent(scene, overlays), false);

  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshBasicMaterial();
  try {
    const body = new THREE.Mesh(geometry, material);
    scene.add(body);
    assert.equal(
      hasForegroundContent(scene, overlays),
      false,
      "Ordinary sketch geometry is excluded",
    );
    body.layers.enable(foregroundBodyLayer);
    assert.equal(hasForegroundContent(scene, overlays), true);
    const group = new THREE.Group();
    group.add(body);
    scene.add(group);
    group.visible = false;
    assert.equal(hasForegroundContent(scene, overlays), false);
    group.visible = true;
    assert.equal(hasForegroundContent(scene, overlays), true, "Showing bodies restores the pass");
  } finally {
    geometry.dispose();
    material.dispose();
  }
});

test("Decorator preview content requires the pass without a visible base body", () => {
  let visible = false;
  const overlay = { hasContent: () => visible, render: () => {} };
  const overlays = new Set([overlay]);
  const scene = new THREE.Scene();
  assert.equal(hasForegroundContent(scene, overlays), false);
  visible = true;
  assert.equal(hasForegroundContent(scene, overlays), true);
  visible = false;
  assert.equal(hasForegroundContent(scene, overlays), false);
});

test("Only active coplanar workspaces bypass X-ray; showing sectionable content restores it", () => {
  let sketch = emptySketch(planes.XY);
  let visible = true;
  let overlayVisible = false;
  const world = {
    activeFrame: planes.XY as typeof planes.XY | null,
    scene: new THREE.Scene(),
    renderForegroundOverlays: new Set([{ hasContent: () => overlayVisible, render: () => {} }]),
    xraySource: () => ({ sketches: [sketch], visibility: "", visible: () => visible }),
  };
  assert.equal(planarOnlyWorkspace(world), true);
  sketch = emptySketch(planes.XZ);
  assert.equal(planarOnlyWorkspace(world), false, "Other visible planes retain local clipping");
  visible = false;
  assert.equal(planarOnlyWorkspace(world), true);
  overlayVisible = true;
  assert.equal(planarOnlyWorkspace(world), false, "Decorator previews retain X-ray");
  overlayVisible = false;
  const body = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  body.layers.enable(foregroundBodyLayer);
  world.scene.add(body);
  try {
    assert.equal(planarOnlyWorkspace(world), false, "Visible bodies retain X-ray");
    body.visible = false;
    assert.equal(planarOnlyWorkspace(world), true);
    world.activeFrame = null;
    assert.equal(planarOnlyWorkspace(world), false, "Modeling retains its normal composite");
  } finally {
    body.geometry.dispose();
    body.material.dispose();
  }
});
