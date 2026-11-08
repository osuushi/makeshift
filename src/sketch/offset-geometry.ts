import { arcAt, arcCircle } from "./arc-geometry.js";
import { bezierAt, bezierDerivative, bezierParameter } from "./bezier-geometry.js";
import { closestOnCurve } from "./curve-geometry.js";
import type { Curve } from "./document.js";
import type { Point } from "./planes.js";
import { add, distance, midpoint, scale, subtract } from "./point-math.js";

// Separate distance checks: numeric no-op, collapsed support, and tangent regularity.
const minimumOffsetDistanceMm = 1e-7;
const minimumOffsetRadiusMm = 1e-7;
const minimumTangentMagnitudeMm = 1e-10;

export function offsetFrame(curve: Curve, near?: Point): { point: Point; normal: Point } {
  if (curve.kind === "bezier") {
    const t = near ? bezierParameter(curve, near) : 0.5;
    let tangent = bezierDerivative(curve, t);
    if (Math.hypot(tangent.x, tangent.y) < minimumTangentMagnitudeMm && (t === 0 || t === 1)) {
      const candidates =
        t === 0
          ? [curve.c1, curve.c2, curve.b].map((p) => subtract(p, curve.a))
          : [curve.c2, curve.c1, curve.a].map((p) => subtract(curve.b, p));
      tangent =
        candidates.find((p) => Math.hypot(p.x, p.y) >= minimumTangentMagnitudeMm) ?? tangent;
    }
    const length = Math.hypot(tangent.x, tangent.y);
    if (length < minimumTangentMagnitudeMm)
      throw new Error("Offset handle requires a regular curve tangent");
    return {
      point: bezierAt(curve, t),
      normal: { x: -tangent.y / length, y: tangent.x / length },
    };
  }
  if (curve.kind === "segment") {
    const v = subtract(curve.b, curve.a),
      length = distance(curve.a, curve.b);
    return {
      point: near ? closestOnCurve(curve, near) : midpoint(curve.a, curve.b),
      normal: { x: -v.y / length, y: v.x / length },
    };
  }
  const circle = curve.kind === "arc" ? arcCircle(curve) : curve;
  const point = near
    ? closestOnCurve(curve, near)
    : curve.kind === "arc"
      ? arcAt(curve, 0.5)
      : add(circle.center, { x: circle.radius, y: 0 });
  return { point, normal: scale(subtract(point, circle.center), 1 / circle.radius) };
}

export function offsetCurve(curve: Curve, amount: number, id: string): Curve {
  if (curve.kind === "bezier") throw new Error("Cubic offsets are not available yet");
  if (!Number.isFinite(amount) || Math.abs(amount) < minimumOffsetDistanceMm)
    throw new Error("Enter a non-zero offset distance");
  if (curve.kind === "segment") {
    const delta = scale(offsetFrame(curve).normal, amount);
    return { ...curve, id, a: add(curve.a, delta), b: add(curve.b, delta) };
  }
  const circle = curve.kind === "arc" ? arcCircle(curve) : curve;
  const radius = circle.radius + amount;
  if (radius <= minimumOffsetRadiusMm) throw new Error("Offset would collapse the curve");
  if (curve.kind === "circle") return { ...curve, id, radius };
  const move = (p: Point) =>
    add(circle.center, scale(subtract(p, circle.center), radius / circle.radius));
  return { ...curve, id, a: move(curve.a), b: move(curve.b) };
}

export function offsetDistance(
  normal: Point,
  start: Point,
  current: Point,
  spacing: number,
): number {
  const delta = subtract(current, start);
  const amount = delta.x * normal.x + delta.y * normal.y;
  return spacing ? Math.round(amount / spacing) * spacing : amount;
}
