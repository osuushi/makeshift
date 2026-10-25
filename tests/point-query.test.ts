import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { emptySketch, type Sketch } from "../src/sketch/document.js";
import { rectangle, transform } from "../src/sketch/geometry.js";
import { planes } from "../src/sketch/planes.js";
import { pointHits, pointKey, resolvePointTargets } from "../src/sketch/point-query.js";
import { SelectedTargets } from "../src/sketch/selected-targets.js";
import { pointTarget } from "../src/sketch/selection-target.js";

test("typed points resolve current coordinates in selection order without selecting whole curves", () => {
  const made = rectangle(emptySketch(planes.XY), { x: 0, y: 0 }, { x: 10, y: 6 });
  const rotated = transform(made.sketch, new Set(made.group.members), (p) => ({ x: -p.y, y: p.x }));
  const sketch: Sketch = {
    ...rotated,
    curves: [
      ...rotated.curves,
      {
        id: "cubic",
        kind: "bezier",
        a: { x: 0, y: 0 },
        c1: { x: 3, y: 6 },
        c2: { x: 9, y: 6 },
        b: { x: 12, y: 0 },
        construction: false,
      },
      {
        id: "arc",
        kind: "arc",
        a: { x: 0, y: 0 },
        b: { x: 4, y: 0 },
        bulge: 1,
        construction: false,
      },
    ],
  };
  const selection = new SelectedTargets();
  selection.replace([
    { kind: "group-handle", group: made.group.id, handle: "edge", index: 1 },
    { kind: "curve-center", curve: "arc" },
    { kind: "midpoint", curve: "cubic" },
    { kind: "endpoint", curve: "removed", end: "a" },
  ]);
  const points = selection.pointHits(sketch);
  assert.deepEqual(points.map(pointKey), [
    `${made.group.id}/edge/1`,
    "arc/center",
    "cubic/midpoint",
  ]);
  assert.deepEqual(
    points.map((hit) => hit.point),
    [
      { x: -3, y: 10 },
      { x: 2, y: 0 },
      { x: 6, y: 4.5 },
    ],
  );
  assert.equal(selection.wholeCurves(sketch).size, 0);
  const changed: Sketch = {
    ...sketch,
    curves: sketch.curves.map((curve) =>
      curve.id === "cubic" && curve.kind === "bezier" ? { ...curve, a: { x: 1, y: 0 } } : curve,
    ),
  };
  assert.deepEqual(selection.pointHits(changed).at(-1)?.point, { x: 6.125, y: 4.5 });
  assert.equal(selection.pointHits(undefined).length, 0);
});

test("captured populated sketch resolves ordered handles and drops obsolete point targets", () => {
  const { document } = JSON.parse(readFileSync("tests/fixtures/populated-sketch.json", "utf8"));
  const sketch: Sketch = document.sketches[0];
  assert.equal(sketch.curves.length, 95);
  const available = pointHits(sketch).reverse();
  const targets = available.map((hit) => {
    const target = pointTarget(hit);
    assert.ok(target);
    return target;
  });
  assert.deepEqual(resolvePointTargets(sketch, targets), available);
  const removed = new Set(sketch.groups[0].members);
  const changed = {
    ...sketch,
    groups: sketch.groups.slice(1),
    curves: sketch.curves.filter((curve) => !removed.has(curve.id)),
  };
  assert.deepEqual(
    resolvePointTargets(changed, targets),
    pointHits(changed).reverse(),
    "Removing a rectangle invalidates its handles without retaining old geometry",
  );
  assert.deepEqual(
    resolvePointTargets(sketch, [
      { kind: "endpoint", curve: sketch.groups[0].members[0], end: "a" },
    ]),
    [],
    "Grouped endpoints remain rectangle handles, not standalone point targets",
  );
});

test("selection resolution does not evaluate unrelated geometry during drawing or point editing", () => {
  const made = rectangle(emptySketch(planes.XY), { x: 0, y: 0 }, { x: 10, y: 6 });
  let geometryReads = 0;
  const unrelated: Sketch["curves"][number] = {
    id: "unselected",
    kind: "arc",
    construction: false,
    get a() {
      geometryReads++;
      return { x: 20, y: 0 };
    },
    b: { x: 24, y: 0 },
    bulge: 1,
  };
  const sketch = { ...made.sketch, curves: [...made.sketch.curves, unrelated] };
  assert.deepEqual(resolvePointTargets(sketch, []), []);
  const selected = resolvePointTargets(sketch, [
    { kind: "group-handle", group: made.group.id, handle: "corner", index: 2 },
  ]);
  assert.deepEqual(
    selected.map((hit) => hit.point),
    [{ x: 10, y: 6 }],
  );
  assert.equal(geometryReads, 0, "Selection must not build every unselected handle");
});
