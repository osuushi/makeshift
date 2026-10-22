import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { guideMoveSource, guideTargetDocument } from "../src/guides/move-source.js";
import { guideMoveTarget, projectToPlane } from "../src/guides/move-target.js";
import type { DisplayDocument } from "../src/model/display-document.js";
import { emptySketch } from "../src/sketch/document.js";
import type { SketchEditor } from "../src/sketch/editor.js";
import { planes, type Vector } from "../src/sketch/planes.js";
import { prism, square } from "./body-edge-fixtures.js";

function targetEditor(document: DisplayDocument): SketchEditor {
  const camera = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 1000);
  camera.position.set(0, 0, 100);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return {
    display: document,
    store: { data: document },
    bodiesVisible: true,
    visibility: { visible: () => true },
    world: {
      camera,
      active: false,
      height: 100,
      target: new THREE.Vector3(),
      canonicalVisibility: { states: { XY: { selectable: true }, XZ: {}, YZ: {} } },
      canvas: {
        clientWidth: 1000,
        clientHeight: 1000,
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 1000 }),
      },
      project: (p: Vector) => ({ x: 500 + p[0] * 10, y: 500 - p[1] * 10 }),
      visiblePoint: () => true,
      clippingAt: () => [],
    },
  } as unknown as SketchEditor;
}

test("direct guide drag uses its owner; Move keeps the selected face or curve", () => {
  const editor = {
    world: { active: false },
    modeling: {
      tool: "select",
      targets: [{ kind: "face", body: "other", face: "cap" }],
      resolve: () => ({
        available: true,
        inputs: { bodies: [], faces: [{ body: "other", face: "cap" }], edges: [] },
      }),
    },
  } as unknown as SketchEditor;
  const anchor = {
    kind: "body-center" as const,
    body: "source",
    feature: "bounds-center" as const,
  };
  assert.deepEqual(guideMoveSource(editor, anchor), {
    kind: "solids",
    ids: ["source"],
    faces: [],
    edges: [],
  });
  Object.assign(editor.modeling, { tool: "move" });
  assert.deepEqual(guideMoveSource(editor, anchor), {
    kind: "solids",
    ids: [],
    faces: [{ body: "other", face: "cap" }],
    edges: [],
  });
  const sketchAnchor = {
    kind: "sketch-curve" as const,
    sketch: "sketch",
    curve: "line",
    feature: "start" as const,
  };
  Object.assign(editor.modeling, { tool: "select" });
  assert.deepEqual(guideMoveSource(editor, sketchAnchor), { kind: "sketches", ids: ["sketch"] });
});

test("moving topology is excluded while stationary same-body references survive", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const cap = body.faces.find(
      (f) => f.plane && f.vertices.every((v, i) => i % 3 !== 2 || Math.abs(v - 10) < 1e-7),
    );
    assert.ok(cap);
    const targets = guideTargetDocument(owner.view.data, {
      kind: "solids",
      ids: [],
      faces: [{ body: body.id, face: cap.id }],
      edges: [],
    });
    assert.ok(targets.bodies?.[0].edges.length);
    assert.ok(
      targets.bodies?.[0].edges.every((e) =>
        e.points.every((v, i) => i % 3 !== 2 || Math.abs(v) < 1e-7),
      ),
    );
    assert.ok(targets.bodies?.[0].faces.every((f) => f.id !== cap.id));
    assert.equal(body.edges.length, 12, "query filtering cannot mutate the accepted body");
    assert.equal(
      guideTargetDocument(owner.view.data, { kind: "solids", ids: [body.id], faces: [], edges: [] })
        .bodies?.length,
      0,
    );
  } finally {
    owner.close();
  }
});

test("origin, sketch corners and normal plane projections are exact snap targets", () => {
  const sketch = {
    ...emptySketch(planes.XY),
    curves: [
      {
        id: "line",
        kind: "segment" as const,
        construction: false,
        a: { x: 12, y: 15 },
        b: { x: 25, y: 15 },
      },
    ],
  };
  const document: DisplayDocument = { units: "mm", sketches: [sketch] };
  const editor = targetEditor(document);
  const origin: Vector = [3, 4, 9];
  assert.deepEqual(guideMoveTarget(editor, document, origin, { x: 501, y: 499 })?.point, [0, 0, 0]);
  assert.deepEqual(
    guideMoveTarget(editor, document, origin, { x: 621, y: 351 })?.point,
    [12, 15, 0],
  );
  assert.deepEqual(guideMoveTarget(editor, document, origin, { x: 700, y: 700 })?.point, [3, 4, 0]);
  const frame = { origin: [5, 0, 0] as Vector, u: [0, 1, 0] as Vector, v: [0, 0, 1] as Vector };
  assert.deepEqual(projectToPlane(origin, frame), [5, 4, 9]);
  const filtered = guideTargetDocument(document, {
    kind: "curves",
    sketchId: sketch.id,
    ids: ["line"],
  });
  assert.equal(filtered.sketches[0].curves.length, 0);
  assert.equal(document.sketches[0].curves.length, 1);
});

test("distinct saved depths at the same screen point remain ambiguous", () => {
  const sketches = [0, 10].map((z) => ({
    ...emptySketch({ ...planes.XY, origin: [0, 0, z] }),
    curves: [
      {
        id: "line",
        kind: "segment" as const,
        construction: false,
        a: { x: 12, y: 15 },
        b: { x: 25, y: 15 },
      },
    ],
  }));
  const document: DisplayDocument = {
    units: "mm",
    sketches,
    guidePoints: sketches.map((s, i) => ({
      id: `g${i}`,
      name: `Guide ${i}`,
      hidden: false,
      anchor: { kind: "sketch-curve", sketch: s.id, curve: "line", feature: "start" },
    })),
  };
  assert.equal(
    guideMoveTarget(targetEditor(document), document, [1, 2, 3], { x: 620, y: 350 }),
    null,
  );
});
