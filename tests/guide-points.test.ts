import assert from "node:assert/strict";
import test from "node:test";
import type * as THREE from "three";
import { DocumentStore } from "../src/backend/document-store.js";
import { validateDocument } from "../src/backend/document-validation.js";
import { guideCandidates } from "../src/guides/candidates.js";
import { guidePosition } from "../src/guides/evaluate.js";
import { edgeCircle } from "../src/guides/geometry.js";
import { editGuides } from "../src/guides/model.js";
import { guideSnap, sketchGuideTargets } from "../src/guides/snapping.js";
import type { GuideAnchor } from "../src/guides/types.js";
import type { Edge } from "../src/model/body.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";
import { emptySketch, type SketchDocument } from "../src/sketch/document.js";
import type { SketchEditor } from "../src/sketch/editor.js";
import { planes, type Vector } from "../src/sketch/planes.js";

const sketch = {
  ...emptySketch(planes.XY),
  curves: [
    {
      id: "line",
      kind: "segment" as const,
      construction: false,
      a: { x: 0, y: 0 },
      b: { x: 20, y: 0 },
    },
    {
      id: "arc",
      kind: "arc" as const,
      construction: false,
      a: { x: -5, y: 0 },
      b: { x: 5, y: 0 },
      bulge: 1,
    },
    {
      id: "circle",
      kind: "circle" as const,
      construction: false,
      center: { x: 30, y: 12 },
      radius: 3,
    },
  ],
};
const document: SketchDocument = { units: "mm", sketches: [sketch] };
const anchor = (
  curve: string,
  feature: "start" | "end" | "midpoint" | "circle-center",
): GuideAnchor => ({ kind: "sketch-curve", sketch: sketch.id, curve, feature });
const near = (actual: Vector | null, expected: Vector) => {
  assert.ok(actual);
  assert.ok(
    Math.hypot(...actual.map((v, i) => v - expected[i])) < 1e-7,
    `${actual} != ${expected}`,
  );
};

test("guide candidates distinguish semantic centers and exact curve landmarks", () => {
  const candidates = guideCandidates(document, [{ kind: "sketch", sketch: sketch.id }]);
  assert.equal(candidates.length, 8);
  near(guidePosition(document, anchor("line", "midpoint")), [10, 0, 0]);
  near(guidePosition(document, anchor("arc", "circle-center")), [0, 0, 0]);
  near(guidePosition(document, anchor("arc", "midpoint")), [0, -5, 0]);
  assert.equal(guidePosition(document, anchor("line", "circle-center")), null);
  assert.equal(guidePosition(document, anchor("circle", "start")), null);
  const edge: Edge = {
    id: "fillet",
    signature: [],
    points: [],
    curve: { kind: "arc", a: [2, 3, 9], mid: [2, 8, 4], b: [2, 3, -1] },
  };
  near(edgeCircle(edge)?.center ?? null, [2, 3, 4]);
  assert.equal(edgeCircle(edge)?.radius, 5);
});

test("guide metadata persists, renames, hides and deletes independently with Undo", () => {
  const first = editGuides(document, { action: "create", anchor: anchor("arc", "circle-center") });
  const guide = first.guidePoints?.[0];
  assert.ok(guide);
  assert.equal(editGuides(first, { action: "create", anchor: guide.anchor }), first);
  const changed = editGuides(first, {
    action: "update",
    id: guide.id,
    name: "Fillet axis",
    hidden: true,
  });
  assert.deepEqual(readArchive(documentArchive(changed)), changed);
  const store = new DocumentStore(first);
  store.accept(changed);
  store.accept(editGuides(changed, { action: "remove", id: guide.id }));
  assert.equal(store.data.guidePoints?.length, 0);
  store.undo();
  assert.deepEqual(store.data, changed);
  store.undo();
  assert.deepEqual(store.data, first);
  store.redo();
  assert.deepEqual(store.data, changed);
  assert.throws(() => editGuides(first, { action: "update", id: guide.id, name: " " }));
  assert.throws(() =>
    editGuides(document, { action: "create", anchor: anchor("line", "circle-center") }),
  );
  assert.throws(() => validateDocument({ ...first, guidePoints: [guide, guide] }), /duplicate/);
  assert.deepEqual(first.sketches, document.sketches);
});

test("guide evaluation follows current curve geometry; deleting the anchor is atomic and undoable", () => {
  const saved = editGuides(document, { action: "create", anchor: anchor("line", "midpoint") });
  const guide = saved.guidePoints?.[0];
  assert.ok(guide);
  const moved: SketchDocument = {
    ...saved,
    sketches: [
      {
        ...sketch,
        curves: sketch.curves.map((c) =>
          c.kind === "segment" ? { ...c, b: { x: 50, y: 10 } } : c,
        ),
      },
    ],
  };
  near(guidePosition(moved, guide.anchor), [25, 5, 0]);
  const store = new DocumentStore(saved);
  store.accept({
    ...saved,
    sketches: [{ ...sketch, curves: sketch.curves.filter((c) => c.id !== "line") }],
  });
  assert.equal(store.data.guidePoints?.length, 0);
  store.undo();
  assert.deepEqual(store.data, saved);
  store.accept({ ...saved, sketches: [] });
  assert.equal(store.data.guidePoints?.length, 0);
});

test("sketch guide snapping uses camera projection, respects visibility and excludes moving anchors", () => {
  const saved = editGuides(document, { action: "create", anchor: anchor("line", "midpoint") });
  const world = {
    activeFrame: planes.XZ,
    visiblePoint: () => true,
    project: (point: Vector) => ({ x: point[0] + point[2], y: point[1] }),
    pointAt: (_frame: unknown, x: number, y: number) => ({ x: x + 7, y: y + 3 }),
  };
  const editor = {
    store: { data: saved },
    display: saved,
    world,
    sketch,
    bodiesVisible: true,
    visibility: { visible: () => true },
  } as unknown as SketchEditor;
  assert.deepEqual(sketchGuideTargets(editor), [
    { point: { x: 17, y: 3 }, label: "Guide point 1" },
  ]);
  assert.deepEqual(sketchGuideTargets(editor, new Set(["line"])), []);
  near(guideSnap(editor, { x: 10, y: 0 }).point, [17, 0, 3]);
  assert.equal(guideSnap(editor, { x: 10, y: 0 }, [sketch.id]).point, null);
  editor.visibility.visible = () => false;
  assert.deepEqual(sketchGuideTargets(editor), []);
  editor.visibility.visible = () => true;
  const hidden = editGuides(saved, {
    action: "update",
    id: saved.guidePoints?.[0].id ?? "",
    hidden: true,
  });
  Object.assign(editor.store, { data: hidden });
  assert.deepEqual(sketchGuideTargets(editor), []);
});

test("ambiguous nearby world guides do not silently choose different depths", () => {
  const saved = editGuides(
    editGuides(document, { action: "create", anchor: anchor("line", "start") }),
    { action: "create", anchor: anchor("line", "end") },
  );
  const editor = {
    store: { data: saved },
    display: saved,
    world: {
      activeFrame: null,
      visiblePoint: (_p: THREE.Vector3) => true,
      project: () => ({ x: 100, y: 100 }),
    },
    bodiesVisible: true,
    visibility: { visible: () => true },
  } as unknown as SketchEditor;
  assert.deepEqual(guideSnap(editor, { x: 100, y: 100 }), { point: null, ambiguous: true });
});
