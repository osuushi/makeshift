import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { foregroundBodyLayer, hasForegroundContent } from "../src/sketch/world-foreground.js";

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
