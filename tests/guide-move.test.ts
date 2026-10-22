import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { guideMovePlanes, projectToPlane } from "../src/guides/move-planes.js";
import { guideMovePoints } from "../src/guides/move-points.js";
import { guideMoveSource } from "../src/guides/move-source.js";
import { guideMoveProbe, guideMoveTargets } from "../src/guides/move-target.js";
import { guideLabel } from "../src/guides/types.js";
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
      tool: null,
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
  Object.assign(editor.modeling, { tool: null });
  assert.deepEqual(guideMoveSource(editor, sketchAnchor), { kind: "sketches", ids: ["sketch"] });
});

test("same-body reference positions include unsaved POIs and remain at the accepted geometry", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const document = owner.view.data,
      editor = targetEditor(document);
    const references = guideMovePoints(editor, document);
    const probe = guideMoveProbe(editor, guideMoveTargets(editor, document, [20, 20, 10]), {
      x: 700,
      y: 500,
    });
    assert.deepEqual(probe.target?.point, [20, 0, 10]);
    assert.ok(
      probe.choices.some((p) => p.point.every((v, i) => v === [20, 0, 0][i])),
      "covered same-body/sketch reference remains in the chooser",
    );
    assert.equal(body.edges.length, 12);
    assert.equal(owner.view.data, document);
    assert.ok(
      references.some((p) => p.point.every((v, i) => v === [20, 10, 10][i])),
      "unsaved edge midpoint is a target",
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
  const targets = guideMoveTargets(editor, document, origin);
  assert.deepEqual(
    targets.filter((p) => p.reference.kind === "plane" && p.plane).map((p) => p.label),
    ["XY plane", "XZ plane", "YZ plane"],
    "drag targets include secondary canonical planes even when only XY is selectable",
  );
  assert.deepEqual(guideMoveProbe(editor, targets, { x: 501, y: 499 }).target?.point, [0, 0, 0]);
  assert.deepEqual(guideMoveProbe(editor, targets, { x: 621, y: 351 }).target?.point, [12, 15, 0]);
  assert.deepEqual(guideMoveProbe(editor, targets, { x: 531, y: 461 }).target?.point, [3, 4, 0]);
  assert.equal(guideMoveProbe(editor, targets, { x: 530, y: 500 }).target?.label, "XZ plane");
  assert.equal(guideMoveProbe(editor, targets, { x: 500, y: 460 }).target?.label, "YZ plane");
  assert.equal(
    guideMoveProbe(editor, targets, { x: 700, y: 700 }).target,
    null,
    "the rest of a plane has no snap hit area",
  );
  const frame = { origin: [5, 0, 0] as Vector, u: [0, 1, 0] as Vector, v: [0, 0, 1] as Vector };
  assert.deepEqual(projectToPlane(origin, frame), [5, 4, 9]);
});

test("plane destinations respect parent visibility and the moving sketch plane", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const frame = { ...planes.YZ, origin: [40, 0, 0] as Vector };
    const document = { ...owner.view.data, constructionPlanes: [{ id: "reference", frame }] };
    const editor = targetEditor(document);
    const origin: Vector = [25, 30, 15];
    const targets = guideMovePlanes(editor, document, origin);
    assert.ok(
      targets.some(
        (p) => p.reference.kind === "face" && p.point.every((v, i) => v === [25, 30, 10][i]),
      ),
      "a normal destination remains available beyond the face boundary",
    );
    assert.ok(targets.some((p) => p.label === "Construction plane" && p.point[0] === 40));
    const planar = guideMovePlanes(editor, document, origin, planes.XY);
    assert.ok(planar.length > 0);
    assert.ok(
      planar.every((p) => p.point[2] === origin[2]),
      "sketch moves remain in their plane",
    );
    editor.visibility.visible = (id) => id !== body.id && id !== "reference";
    assert.ok(
      guideMovePlanes(editor, document, origin).every(
        (p) => p.reference.kind === "plane" && p.reference.world,
      ),
      "hidden faces and saved planes contribute no destinations",
    );
  } finally {
    owner.close();
  }
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
    guideMoveProbe(
      targetEditor(document),
      guideMoveTargets(targetEditor(document), document, [1, 2, 3]),
      { x: 620, y: 350 },
    ).target,
    null,
  );
});

test("tooltips omit generated guide names and retain custom names", () => {
  const guide = {
    id: "g",
    name: "Guide point 2",
    hidden: false,
    anchor: { kind: "body-center" as const, body: "b", feature: "bounds-center" as const },
  };
  assert.equal(guideLabel(guide), "Body bounding-box center");
  assert.equal(
    guideLabel({ ...guide, name: "Axle reference" }),
    "Axle reference · Body bounding-box center",
  );
});
