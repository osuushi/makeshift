import { arcCircle, onArc } from "./arc-geometry.js";
import {
  bezierAt,
  bezierParameter,
  bezierPowers,
  bezierSpan,
  splitBezier,
} from "./bezier-geometry.js";
import type { Bezier, Curve } from "./document.js";
import type { Point } from "./planes.js";
import { distance, dot, subtract } from "./point-math.js";
import { multiply, roots, sum } from "./polynomial.js";

export function bezierIntersections(a: Bezier, b: Curve, includeOverlapEnds = true): Point[] {
  if (b.kind === "bezier") return pairIntersections(a, b, includeOverlapEnds);
  const x = bezierPowers(a, "x"),
    y = bezierPowers(a, "y");
  if (b.kind === "segment") {
    const d = subtract(b.b, b.a),
      length = dot(d, d);
    const equation = sum(
      x.map((v) => v * d.y),
      y.map((v) => -v * d.x),
    );
    equation[0] += b.a.y * d.x - b.a.x * d.y;
    return roots(equation)
      .map((t) => bezierAt(a, t))
      .filter((p) => {
        const t = dot(subtract(p, b.a), d) / length;
        return t >= -1e-9 && t <= 1 + 1e-9;
      });
  }
  const circle = b.kind === "arc" ? arcCircle(b) : b;
  x[0] -= circle.center.x;
  y[0] -= circle.center.y;
  const equation = sum(multiply(x, x), multiply(y, y));
  equation[0] -= circle.radius ** 2;
  return roots(equation)
    .map((t) => bezierAt(a, t))
    .filter((p) => b.kind !== "arc" || onArc(b, p));
}
function box(c: Bezier): number[] {
  const ps = [c.a, c.c1, c.c2, c.b];
  return [
    Math.min(...ps.map((p) => p.x)),
    Math.min(...ps.map((p) => p.y)),
    Math.max(...ps.map((p) => p.x)),
    Math.max(...ps.map((p) => p.y)),
  ];
}
function overlap(a: Bezier, b: Bezier): Point[] | null {
  const ends = [a.a, a.b, b.a, b.b].filter(
    (p, i, all) => !all.slice(0, i).some((q) => distance(p, q) < 1e-8),
  );
  const shared = ends
    .map((p) => ({ p, a: bezierParameter(a, p), b: bezierParameter(b, p) }))
    .filter(
      (hit) =>
        distance(bezierAt(a, hit.a), hit.p) < 1e-8 && distance(bezierAt(b, hit.b), hit.p) < 1e-8,
    )
    .sort((x, y) => x.a - y.a);
  if (shared.length < 2) return null;
  const first = shared[0],
    last = shared[shared.length - 1];
  const A = bezierSpan(a, first.a, last.a),
    B = bezierSpan(b, first.b, last.b);
  return (["a", "c1", "c2", "b"] as const).every((key) => distance(A[key], B[key]) < 1e-8)
    ? [first.p, last.p]
    : null;
}
function pairIntersections(a: Bezier, b: Bezier, includeOverlapEnds: boolean): Point[] {
  if (
    [a.a, a.c1, a.c2, a.b].every((p, i) => distance(p, [b.a, b.c1, b.c2, b.b][i]) < 1e-9) ||
    [a.a, a.c1, a.c2, a.b].every((p, i) => distance(p, [b.b, b.c2, b.c1, b.a][i]) < 1e-9)
  )
    return includeOverlapEnds ? [a.a, a.b] : [];
  const shared = overlap(a, b);
  if (shared) return includeOverlapEnds ? shared : [];
  // Keep known shared endpoints exact. At stationary ends subdivision can
  // otherwise report a nearby point and manufacture a microscopic trim remnant.
  const points: Point[] = [a.a, a.b].filter(
    (p, i) => (!i || distance(p, a.a) >= 1e-7) && [b.a, b.b].some((q) => distance(p, q) < 1e-9),
  );
  let visits = 0;
  const visit = (a: Bezier, b: Bezier, depth: number) => {
    const A = box(a),
      B = box(b),
      epsilon = 1e-9;
    if (
      A[0] > B[2] + epsilon ||
      B[0] > A[2] + epsilon ||
      A[1] > B[3] + epsilon ||
      B[1] > A[3] + epsilon
    )
      return;
    if (++visits > 100000)
      throw new Error("Curve intersection is too complex; split the curves first");
    const da = Math.max(A[2] - A[0], A[3] - A[1]),
      db = Math.max(B[2] - B[0], B[3] - B[1]);
    if (Math.max(da, db) < 1e-8 || depth > 72) {
      const p = bezierAt(a, 0.5);
      if (!points.some((q) => distance(p, q) < 1e-7)) points.push(p);
      return;
    }
    if (da >= db) {
      const [l, r] = splitBezier(a, 0.5);
      visit(l, b, depth + 1);
      visit(r, b, depth + 1);
    } else {
      const [l, r] = splitBezier(b, 0.5);
      visit(a, l, depth + 1);
      visit(a, r, depth + 1);
    }
  };
  visit(a, b, 0);
  return points;
}
