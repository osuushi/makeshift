import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { CanonicalPlaneVisibility } from "../src/sketch/canonical-plane-visibility.js";
import { defaultSketchGrid } from "../src/sketch/grid-settings.js";
import { createGrids } from "../src/sketch/world-grid.js";

test("modeling grids and snap step follow document grid sizes", () => {
  const scene = new THREE.Scene();
  const grids = createGrids(scene);
  const camera = new THREE.OrthographicCamera(-20, 20, 20, -20, 0.1, 100);
  camera.position.set(0, 0, 30);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const visibility = new CanonicalPlaneVisibility().states;
  visibility.XY.opacity = 1;
  try {
    for (const size of [
      { minor: 2, major: 20 },
      { minor: 5, major: 50 },
    ]) {
      const snap = grids.update(camera, new THREE.Vector3(), 40, null, 800, visibility, {
        ...defaultSketchGrid,
        ...size,
      });
      assert.equal(snap, size.minor);
      const meshes = scene.children.filter(
        (child): child is THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> =>
          child instanceof THREE.Mesh && child.userData.coordinateGrid && child.renderOrder === -10,
      );
      assert.equal(meshes.length, 3);
      for (const mesh of meshes) {
        assert.equal(mesh.material.uniforms.spacing.value, size.minor);
        assert.equal(mesh.material.uniforms.majorSpacing.value, size.major);
      }
    }
  } finally {
    grids.dispose();
  }
});
