import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { EntityVisibility } from "../src/model/entity-visibility.js";
import type { VisualPreview } from "../src/model/visual-preview.js";
import { emptySketch, type SketchDocument } from "../src/sketch/document.js";
import type { SketchEditor } from "../src/sketch/editor.js";
import { installCameraDepth } from "../src/sketch/editor-camera-depth.js";
import { worldPoint } from "../src/sketch/planes.js";

test("tilted sketch circles are enclosed; visibility and previews invalidate cached depth bounds", () => {
  const sketch = {
    ...emptySketch({
      origin: [30, 40, 500],
      u: [Math.SQRT1_2, 0, Math.SQRT1_2],
      v: [-Math.SQRT1_2, 0, Math.SQRT1_2],
    }),
    curves: [
      {
        id: "circle",
        kind: "circle" as const,
        construction: false,
        center: { x: 0, y: 0 },
        radius: 20,
      },
    ],
  };
  const document: SketchDocument = { units: "mm", sketches: [sketch] };
  const state = {
    world: { depthBounds: () => new THREE.Box3() },
    display: document,
    visibility: new EntityVisibility(),
    bodiesVisible: true,
    interactions: { current: { visualPreview: undefined as VisualPreview | undefined } },
  };
  installCameraDepth(state as unknown as SketchEditor);
  const bounds = state.world.depthBounds();
  for (let i = 0; i < 360; i++) {
    const p = worldPoint(sketch.plane, {
      x: 20 * Math.cos((i * Math.PI) / 180),
      y: 20 * Math.sin((i * Math.PI) / 180),
    });
    assert.ok(bounds.containsPoint(new THREE.Vector3(...p)));
  }
  assert.equal(state.world.depthBounds(), bounds);
  state.display = {
    ...document,
    sketches: [{ ...sketch, plane: { ...sketch.plane, origin: [30, 40, 900] } }],
  };
  assert.ok(state.world.depthBounds().max.z > 900, "Preview geometry participates immediately");
  state.visibility.hidden.add(sketch.id);
  assert.deepEqual(state.world.depthBounds().max.toArray(), [0, 0, 0]);
  state.interactions.current.visualPreview = {
    bodies: [{ bounds: [0, 0, 0, 10, 20, 1200], faces: [], edges: [], planes: [] }],
  };
  assert.equal(state.world.depthBounds().max.z, 1200, "Mesh-first previews extend the clip range");
  state.interactions.current.visualPreview = undefined;
  assert.equal(state.world.depthBounds().max.z, 0, "Discard restores accepted depth bounds");
});
