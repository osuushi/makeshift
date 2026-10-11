import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { pickSavedPlane } from "../src/model/saved-plane-picking.js";
import type { SketchEditor } from "../src/sketch/editor.js";
import { pickModels } from "../src/sketch/model-selection.js";
import { ModelSelection } from "../src/sketch/model-selection-state.js";
import { minimumPlaneBounds } from "../src/sketch/plane-bounds.js";
import { planes } from "../src/sketch/planes.js";

function scene(faceZ: number) {
  const camera = new THREE.OrthographicCamera(-20, 20, 20, -20, 0.1, 1000);
  camera.position.set(0, 0, 100);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return {
    bodiesVisible: true,
    visibility: { visible: () => true },
    modeling: new ModelSelection(),
    world: {
      camera,
      renderer: { clippingPlanes: [] },
      clippingAt: () => [],
      visiblePoint: () => true,
      planeBounds: minimumPlaneBounds,
      canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }) },
    },
    display: {
      sketches: [],
      constructionPlanes: [{ id: "plane", frame: planes.XY }],
      bodies: [
        {
          id: "body",
          edges: [],
          faces: [
            { id: "face", edges: [], vertices: [-10, -10, faceZ, 10, -10, faceZ, 0, 10, faceZ] },
          ],
        },
      ],
    },
  } as unknown as SketchEditor;
}
const cursor = { x: 200, y: 200 };
test("ordinary geometry wins over a plane in front, behind or coplanar", () => {
  const behind = scene(-10);
  assert.equal(pickModels(behind, cursor)[0]?.kind, "face");
  assert.deepEqual(pickModels(behind, cursor, 100), []);
  assert.equal(pickSavedPlane(behind, cursor), null);
  behind.world.planePicker = () => {};
  assert.equal(pickSavedPlane(behind, cursor)?.plane.id, "plane");
  for (const z of [0, 10]) {
    const editor = scene(z);
    assert.equal(pickModels(editor, cursor, 100)[0]?.kind, "face");
    assert.equal(pickSavedPlane(editor, cursor), null);
  }
});
test("saved plane picking respects visibility and the nearer world-plane depth", () => {
  const editor = scene(-10);
  assert.equal(pickSavedPlane(editor, cursor, 90), null);
  editor.visibility.visible = (id) => id !== "plane";
  assert.equal(pickSavedPlane(editor, cursor), null);
});
