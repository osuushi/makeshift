import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { bezierAt, bezierDerivative } from "../src/sketch/bezier-geometry.js";
import type { Arc, Bezier, Circle, Sketch } from "../src/sketch/document.js";
import { segment } from "../src/sketch/geometry.js";
import { offsetDistance, offsetFrame } from "../src/sketch/offset-geometry.js";
import { offsetHandleFrame } from "../src/sketch/offset-handle-frame.js";
import { prepareOffset } from "../src/sketch/offset-target.js";
import type { Point } from "../src/sketch/planes.js";
import { add, distance, dot, scale } from "../src/sketch/point-math.js";

const near = (a: Point, b: Point) =>
  assert.ok(distance(a, b) < 1e-8, `${JSON.stringify(a)} != ${JSON.stringify(b)}`);

test("relocated loop handle uses the closest edge and its outward normal regardless of input order", () => {
  const points = [
    { x: -10, y: -5 },
    { x: 10, y: -5 },
    { x: 10, y: 5 },
    { x: -10, y: 5 },
  ];
  const curves = points.map((p, i) => segment(p, points[(i + 1) % 4]));
  for (const source of [
    curves,
    [...curves].reverse(),
    curves.map((c) => ({ ...c, a: c.b, b: c.a })),
  ]) {
    const target = prepareOffset(source);
    for (const [position, point, normal] of [
      [
        { x: 20, y: 2 },
        { x: 10, y: 2 },
        { x: 1, y: 0 },
      ],
      [
        { x: -20, y: -2 },
        { x: -10, y: -2 },
        { x: -1, y: 0 },
      ],
      [
        { x: 3, y: 15 },
        { x: 3, y: 5 },
        { x: 0, y: 1 },
      ],
      [
        { x: -3, y: -15 },
        { x: -3, y: -5 },
        { x: 0, y: -1 },
      ],
    ]) {
      const frame = offsetHandleFrame(target, position);
      near(frame.point, point);
      near(frame.normal, normal);
    }
  }
});

test("circular and arc handles use the closest radial point instead of the nominal midpoint", () => {
  const circle: Circle = {
    id: "circle",
    kind: "circle",
    construction: false,
    center: { x: 2, y: 3 },
    radius: 5,
  };
  const normal = { x: 0.6, y: 0.8 };
  const frame = offsetHandleFrame(prepareOffset([circle]), add(circle.center, scale(normal, 20)));
  near(frame.point, add(circle.center, scale(normal, 5)));
  near(frame.normal, normal);
  const arc: Arc = {
    id: "arc",
    kind: "arc",
    construction: false,
    a: { x: 5, y: 0 },
    b: { x: -5, y: 0 },
    bulge: 1,
  };
  near(offsetHandleFrame(prepareOffset([arc]), { x: 12, y: 16 }).normal, normal);
  const loop = prepareOffset([segment(arc.b, arc.a), arc]);
  near(offsetHandleFrame(loop, { x: 12, y: 16 }).normal, normal);
});

test("cubic loops retain outward traversal for every boundary and nearest cubic tangents", () => {
  const sketch: Sketch = JSON.parse(
    readFileSync("tests/fixtures/offset-cubic-section.json", "utf8"),
  );
  const target = prepareOffset(sketch.curves);
  assert.ok(target.boundary && target.boundary.length > 1);
  for (const { curve, direction } of target.boundary) {
    const base = offsetFrame(curve);
    const normal = scale(base.normal, direction);
    near(offsetHandleFrame(target, add(base.point, scale(normal, 0.01))).normal, normal);
  }
  const curve: Bezier = {
    id: "cubic",
    kind: "bezier",
    construction: false,
    a: { x: 0, y: 0 },
    c1: { x: 10, y: 0 },
    c2: { x: 10, y: 10 },
    b: { x: 0, y: 10 },
  };
  const p = bezierAt(curve, 0.2),
    tangent = bezierDerivative(curve, 0.2);
  const n = scale({ x: -tangent.y, y: tangent.x }, 1 / Math.hypot(tangent.x, tangent.y));
  const local = offsetFrame(curve, add(p, scale(n, -0.1)));
  near(local.point, p);
  near(local.normal, n);
  near(offsetFrame({ ...curve, c1: curve.a }, { x: -1, y: -1 }).normal, {
    x: -Math.SQRT1_2,
    y: Math.SQRT1_2,
  });
});

test("normal drag ignores tangential travel, preserves signed inward movement and snaps on that axis", () => {
  const normal = { x: 0.6, y: 0.8 },
    start = { x: 14, y: -3 };
  const tangent = { x: -normal.y, y: normal.x };
  for (const amount of [-4, 0, 3]) {
    const current = add(start, add(scale(normal, amount), scale(tangent, 20)));
    assert.ok(Math.abs(offsetDistance(normal, start, current, 0) - amount) < 1e-8);
  }
  assert.equal(offsetDistance(normal, start, add(start, scale(normal, 2.4)), 1), 2);
  assert.ok(Math.abs(dot(normal, tangent)) < 1e-8);
});
