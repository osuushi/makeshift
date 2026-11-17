import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { arcAt, arcCircle, bowRadius, bowThrough, onArc } from "../src/sketch/arc-geometry.js";
import { curveIntersections } from "../src/sketch/curve-intersections.js";
import { spanArea } from "../src/sketch/curve-spans.js";
import { type Arc, emptySketch } from "../src/sketch/document.js";
import { rectangle, segment } from "../src/sketch/geometry.js";
import { movePoint, transformSelection } from "../src/sketch/line-edit.js";
import { planes } from "../src/sketch/planes.js";
import { distance } from "../src/sketch/point-math.js";
import { dimensionRectangle } from "../src/sketch/rectangle-edit.js";
import { closedBoundaries } from "../src/sketch/regions.js";
import { validateSketch } from "../src/sketch/sketch-validation.js";

const line = segment({ x: -4, y: 0 }, { x: 4, y: 0 });
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const asArc = (curve: ReturnType<typeof bowThrough>): Arc => {
  assert.equal(curve.kind, "arc");
  return curve as Arc;
};
test("bow passes through arbitrary third point, supports both sides and branches", () => {
  for (const p of [
    { x: 0, y: 2 },
    { x: 0, y: 8 },
    { x: 2, y: 3 },
    { x: 10, y: 3 },
    { x: 0, y: -2 },
    { x: 0, y: -8 },
  ]) {
    const arc = asArc(bowThrough(line, p));
    assert.ok(onArc(arc, p));
    near(distance(arcCircle(arc).center, p), arcCircle(arc).radius);
    assert.deepEqual(arc.a, line.a);
    assert.deepEqual(arc.b, line.b);
  }
  const minor = asArc(bowThrough(line, { x: 0, y: 2 })),
    major = asArc(bowThrough(line, { x: 0, y: 8 }));
  near(arcCircle(minor).radius, 5);
  near(arcCircle(major).radius, 5);
  near(minor.bulge, -0.5);
  near(major.bulge, -2);
  near(arcCircle(bowRadius(line, 5, 1)).center.y, -3);
  near(bowRadius(major, 5, 1).bulge, -2);
  near(bowRadius(major, -5, 1).bulge, 2);
  near(bowRadius(minor, -5, 1).bulge, 0.5);
  near(bowRadius(line, -5, 1).bulge, -bowRadius(line, 5, 1).bulge);
  assert.throws(() => bowRadius(line, -3, 1), /at least/);
  assert.ok(Math.abs(bowRadius(major, 8, 1).bulge) > 1);
  assert.ok(Math.abs(bowRadius(bowRadius(major, 4, 1), 5, 1).bulge) > 1);
  assert.throws(() => bowRadius(line, 3, 1), /at least/);
  assert.equal(bowThrough(minor, { x: 2, y: 0 }).kind, "segment");
  for (const side of [-1, 1]) near(Math.abs(bowRadius(line, 4, side).bulge), 1);
});
test("arc domains filter intersections and form analytic bounded faces", () => {
  for (const bulge of [-0.5, -2, 0.5, 2]) {
    const arc: Arc = { ...line, kind: "arc", bulge };
    const vertical = segment({ x: 0, y: -20 }, { x: 0, y: 20 });
    const intersections = curveIntersections(arc, vertical);
    assert.equal(intersections.length, 1);
    near(intersections[0].y, -4 * bulge);
    const boundaries = closedBoundaries([arc, { ...line, id: "chord" }]);
    assert.equal(boundaries.length, 1);
    const theta = Math.abs(4 * Math.atan(bulge)),
      r = arcCircle(arc).radius;
    near(
      boundaries[0].reduce((n, s) => n + spanArea(s), 0),
      (r * r * (theta - Math.sin(theta))) / 2,
    );
    assert.equal(closedBoundaries([arc]).length, 0);
    assert.equal(closedBoundaries([arc, vertical]).length, 0);
    const reverse: Arc = { ...arc, a: arc.b, b: arc.a, bulge: -arc.bulge };
    near(
      closedBoundaries([reverse, line])[0].reduce((n, s) => n + spanArea(s), 0),
      (r * r * (theta - Math.sin(theta))) / 2,
    );
  }
});
test("arc move, endpoint edits and backend history retain analytic geometry", async () => {
  const arc = asArc(bowThrough(line, { x: 0, y: 2 }));
  const sketch = { ...emptySketch(planes.XY), curves: [arc] };
  const moved = transformSelection(sketch, new Set([arc.id]), (p) => ({ x: -p.y + 3, y: p.x + 2 }));
  near(distance((moved.curves[0] as Arc).a, { x: 3, y: -2 }), 0);
  near(arcCircle(moved.curves[0] as Arc).radius, 5);
  const edited = movePoint(sketch, { curve: arc.id, end: "a" }, { x: -6, y: 0 });
  validateSketch(edited);
  near((edited.curves[0] as Arc).bulge, arc.bulge);
  near(arcAt(edited.curves[0] as Arc, 0).x, -6);
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
    assert.equal((await owner.call({ kind: "edit", sketch: edited })).error, undefined);
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data.sketches[0], sketch);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data.sketches[0], edited);
  } finally {
    owner.close();
  }
});

test("native rectangle solving preserves interleaved arc geometry", async () => {
  const made = rectangle(emptySketch(planes.XY), { x: 10, y: 10 }, { x: 20, y: 20 });
  const arc = asArc(bowThrough(line, { x: 0, y: 8 }));
  const sketch = {
    ...made.sketch,
    curves: [made.sketch.curves[0], arc, ...made.sketch.curves.slice(1)],
  };
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
    const target = dimensionRectangle(sketch, made.group, "width", 15);
    assert.equal((await owner.call({ kind: "edit", sketch: target })).error, undefined);
    assert.ok(owner.view.solveCount > 0);
    assert.deepEqual(owner.view.data.sketches[0].curves[1], arc);
    validateSketch(owner.view.data.sketches[0]);
  } finally {
    owner.close();
  }
});
