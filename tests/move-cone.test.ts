import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { coneVisible } from "../src/sketch/move-widget/cone.js";

test("Move hides circular cone projections on both camera sides, retaining directional silhouettes", () => {
  const camera = new THREE.OrthographicCamera();
  for (const sign of [-1, 1]) {
    for (const degrees of [0, 12, 20]) {
      const angle = (degrees * Math.PI) / 180;
      assert.equal(coneVisible(camera, [Math.sin(angle), 0, sign * Math.cos(angle)]), false);
    }
    for (const degrees of [22, 45, 90]) {
      const angle = (degrees * Math.PI) / 180;
      assert.equal(coneVisible(camera, [Math.sin(angle), 0, sign * Math.cos(angle)]), true);
    }
  }
  camera.rotation.set(0, Math.PI / 2, 0);
  assert.equal(coneVisible(camera, [1, 0, 0]), false);
  assert.equal(coneVisible(camera, [0, 0, 1]), true);
});
