import { arcCircle } from "./arc-geometry.js";
import { recoverCubicCorner } from "./cubic-fillet-support.js";
import { supportIntersections } from "./curve-intersections.js";
import type { Arc, Curve } from "./document.js";
import type { Point } from "./planes.js";
import { add, distance, dot, scale } from "./point-math.js";
import { roundingShape } from "./rounding-candidates.js";
import { inwardTangent, type RoundingCurve, trimRoundingCurve } from "./rounding-curves.js";

export interface FilletCorner {
  a: RoundingCurve;
  b: RoundingCurve;
  aEnd: "a" | "b";
  bEnd: "a" | "b";
  point: Point;
  u: Point;
  v: Point;
  bisector: Point;
  half: number;
  limit: number;
}
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
export function filletCorner(
  a: RoundingCurve,
  b: RoundingCurve,
  aEnd: "a" | "b",
  bEnd: "a" | "b",
): FilletCorner {
  if (a.kind === "bezier" && b.kind === "bezier")
    throw new Error("Cubic fillets need a line or circular arc as the other support");
  if (distance(a[aEnd], b[bEnd]) >= 1e-7) {
    if (a.kind === "bezier" && b.kind !== "bezier") {
      a = recoverCubicCorner(a, aEnd, b);
      b = trimRoundingCurve(b, bEnd, a[aEnd]) ?? b;
    } else if (b.kind === "bezier" && a.kind !== "bezier") {
      b = recoverCubicCorner(b, bEnd, a);
      a = trimRoundingCurve(a, aEnd, b[bEnd]) ?? a;
    }
  }
  const point =
    distance(a[aEnd], b[bEnd]) < 1e-7
      ? a[aEnd]
      : supportIntersections(a, b).sort(
          (p, q) =>
            distance(p, a[aEnd]) +
            distance(p, b[bEnd]) -
            distance(q, a[aEnd]) -
            distance(q, b[bEnd]),
        )[0];
  if (!point) throw new Error("Select two curves meeting at a corner");
  a = trimRoundingCurve(a, aEnd, point) ?? a;
  b = trimRoundingCurve(b, bEnd, point) ?? b;
  const u = inwardTangent(a, aEnd),
    v = inwardTangent(b, bEnd);
  if (Math.abs(cross(u, v)) < 1e-8) throw new Error("A fillet needs a non-straight corner");
  const half = Math.acos(Math.max(-1, Math.min(1, dot(u, v)))) / 2;
  const sum = add(u, v),
    bisector = scale(sum, 1 / Math.hypot(sum.x, sum.y));
  const lengths = [
    distance(a[aEnd === "a" ? "b" : "a"], point),
    distance(b[bEnd === "a" ? "b" : "a"], point),
  ];
  if (Math.min(...lengths) <= 1e-8) throw new Error("The fillet lies beyond the selected edges");
  return {
    a,
    b,
    aEnd,
    bEnd,
    point,
    u,
    v,
    bisector,
    half,
    limit: Math.min(...lengths) * Math.tan(half),
  };
}
export function filletShape(c: FilletCorner, radius: number, id: string): Arc {
  if (!Number.isFinite(radius) || radius <= 1e-7)
    throw new Error("Fillet radius must be greater than zero");
  if (c.a.kind !== "segment" || c.b.kind !== "segment" || radius > c.limit + 1e-7)
    return roundingShape(c, radius, id);
  const offset = Math.min(radius, c.limit) / Math.tan(c.half);
  return {
    id,
    kind: "arc",
    construction: c.a.construction && c.b.construction,
    a: add(c.point, scale(c.u, offset)),
    b: add(c.point, scale(c.v, offset)),
    bulge: -Math.sign(cross(c.u, c.v)) * Math.tan((Math.PI - 2 * c.half) / 4),
  };
}
export function filletGeometry(
  curves: readonly Curve[],
  c: FilletCorner,
  radius: number,
  id: string,
) {
  const arc = filletShape(c, radius, id);
  const updated = curves.flatMap((curve) => {
    const changed =
      curve.id === c.a.id
        ? trimRoundingCurve(c.a, c.aEnd, arc.a)
        : curve.id === c.b.id
          ? trimRoundingCurve(c.b, c.bEnd, arc.b)
          : curve.id === id
            ? arc
            : curve;
    return changed ? [changed] : [];
  });
  return {
    curves: curves.some((c) => c.id === id) ? updated : [...updated, arc],
    arc,
    center: arcCircle(arc).center,
  };
}
