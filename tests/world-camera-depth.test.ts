import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import type { World } from "../src/sketch/world.js";
import { fitWorldCameraDepth } from "../src/sketch/world-camera-depth.js";

test("reference opacity handoffs cannot change restored camera depth", () => {
  const start = new THREE.Vector3(58.88401354323014, -49.824526200604, -173.16860156618736);
  const target = new THREE.Vector3(16.225421137809505, -0.24732998934629258, -2.273776881011135);
  const results: THREE.Vector3[] = [];
  for (const opacity of [0, 0.001, 0.35, 1]) {
    const camera = new THREE.OrthographicCamera(-46, 46, 30, -30, 0.1, 10000);
    camera.position.copy(start);
    camera.up.set(-0.9724458160388286, -0.06495351591015174, -0.2238976901164605);
    camera.lookAt(target);
    const world = {
      camera,
      target,
      height: 60,
      activeFrame: null,
      depthBounds: () => new THREE.Box3(),
      canonicalVisibility: { states: { XY: { opacity }, XZ: { opacity }, YZ: { opacity } } },
    };
    fitWorldCameraDepth(world as unknown as World);
    const fitted = camera.position.clone();
    fitWorldCameraDepth(world as unknown as World);
    assert.ok(camera.position.distanceTo(fitted) < 1e-10, "Repeated paint preserves the view");
    results.push(fitted);
  }
  for (const result of results) assert.deepEqual(result.toArray(), results[0].toArray());
});
