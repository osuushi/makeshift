import assert from "node:assert/strict";
import test from "node:test";
import { guideMoveSource } from "../src/guides/move-source.js";
import { guideMoveProbe } from "../src/guides/move-target.js";
import {
  faceGuidePath,
  planarGuidePath,
  toolPathPoint,
  toolPlaneDistance,
  toolPointDistance,
} from "../src/guides/tool-path.js";
import { alignToolPoint } from "../src/guides/tool-targets.js";
import type { Face } from "../src/model/body.js";
import type { SketchEditor } from "../src/sketch/editor.js";
import { planes, type Vector } from "../src/sketch/planes.js";

test("planar tools distinguish exact coincidence from matching height", () => {
  const path = planarGuidePath([2, 3, 10], { ...planes.XY, origin: [0, 0, 10] });
  assert.ok(path);
  assert.equal(toolPointDistance(path, [2, 3, 18]), 8);
  assert.equal(toolPointDistance(path, [9, 7, 18]), null);
  const alignment = alignToolPoint(path, [9, 7, 18]);
  assert.deepEqual(alignment?.point, [2, 3, 18]);
  assert.deepEqual(alignment?.alignment.point, [9, 7, 18]);
  assert.equal(alignment?.distance, 8);
  assert.equal(planarGuidePath([2, 3, 11], { ...planes.XY, origin: [0, 0, 10] }), null);
});

test("plane targets intersect the permitted path rather than projecting sideways", () => {
  const path = planarGuidePath([2, 3, 0], planes.XY);
  assert.ok(path);
  const q = Math.SQRT1_2;
  const plane = { origin: [0, 0, 10] as Vector, u: [q, 0, q] as Vector, v: [0, 1, 0] as Vector };
  const distance = toolPlaneDistance(path, plane);
  assert.equal(distance, 12);
  assert.deepEqual(toolPathPoint(path, distance), [2, 3, 12]);
  assert.equal(toolPlaneDistance(path, planes.YZ), null);
  assert.equal(toolPlaneDistance(path, { ...planes.YZ, origin: [2, 0, 0] }), null);
});

function cylinderFace(outward: 1 | -1): Face {
  return {
    id: "wall",
    edges: [],
    signature: [],
    vertices: [],
    plane: null,
    cylinder: { origin: [0, 0, 0], axis: [0, 0, 1], radius: 5, outward },
  };
}

test("cylindrical handles use the support extension and respect inward normals and collapse", () => {
  const outer = faceGuidePath([5, 0, 200], cylinderFace(1));
  const inner = faceGuidePath([5, 0, 200], cylinderFace(-1));
  assert.ok(outer && inner);
  assert.equal(toolPointDistance(outer, [8, 0, 200]), 3);
  assert.equal(toolPointDistance(inner, [8, 0, 200]), -3);
  assert.equal(toolPointDistance(outer, [0, 8, 200]), null);
  assert.deepEqual(alignToolPoint(outer, [0, 8, -50])?.point, [8, 0, 200]);
  assert.equal(toolPathPoint(outer, -5), null);
  assert.equal(toolPathPoint(inner, 6), null);
  assert.equal(alignToolPoint(outer, [0, 0, 20]), null);
  assert.equal(
    faceGuidePath([0, 0, 0], cylinderFace(1)),
    null,
    "axis centers do not move radially",
  );
  assert.equal(faceGuidePath([6, 0, 200], cylinderFace(1)), null);
});

test("an active non-Move tool never falls back to translating the guide owner", () => {
  const anchor = { kind: "body-center" as const, body: "body", feature: "bounds-center" as const };
  for (const tool of ["offset", "extrude", "fillet", "revolve"])
    assert.equal(
      guideMoveSource(
        { world: { active: false }, modeling: { tool } } as unknown as SketchEditor,
        anchor,
      ),
      null,
    );
});

test("screen hit testing preserves the solved signed tool parameter", () => {
  const editor = {
    world: { project: () => ({ x: 100, y: 100 }), camera: { position: { x: 0, y: 0, z: 100 } } },
  } as unknown as SketchEditor;
  const target = {
    point: [8, 0, 5] as Vector,
    label: "Exact",
    reference: { kind: "plane" as const, frame: planes.XY },
    distance: -3,
    saved: false,
    visible: true,
  };
  assert.equal(guideMoveProbe(editor, [target], { x: 102, y: 101 }).target?.distance, -3);
});

test("symmetric extrusion solves total depth while the dragged cap moves half", () => {
  const path = {
    origin: [0, 0, 0] as Vector,
    direction: [0, 0, 1] as Vector,
    plane: planes.XY,
    distanceScale: 2,
  };
  assert.equal(toolPointDistance(path, [0, 0, 8]), 16);
  assert.deepEqual(toolPathPoint(path, 16), [0, 0, 8]);
  assert.equal(alignToolPoint(path, [20, 10, 8])?.distance, 16);
});
