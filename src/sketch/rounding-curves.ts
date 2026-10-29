import { arcCircle, arcDomain, positiveAngle } from "./arc-geometry.js";
import { bezierDerivative, bezierParameter, bezierSpan } from "./bezier-geometry.js";
import type { Arc, Bezier, Segment } from "./document.js";
import type { Point } from "./planes.js";
import { distance, scale, subtract } from "./point-math.js";
export type RoundingCurve = Segment | Arc | Bezier;
export type CurveEnd = "a" | "b";
export const farEnd = (end: CurveEnd): CurveEnd => (end === "a" ? "b" : "a");
export function inwardTangent(curve: RoundingCurve, end: CurveEnd, point = curve[end]): Point {
  if (curve.kind === "bezier") {
    const t = bezierParameter(curve, point);
    let d = bezierDerivative(curve, t);
    if (Math.hypot(d.x, d.y) < 1e-12) d = bezierDerivative(curve, end === "a" ? 1e-6 : 1 - 1e-6);
    return scale(d, (end === "a" ? 1 : -1) / Math.hypot(d.x, d.y));
  }
  if (curve.kind === "segment") {
    const delta = subtract(curve[farEnd(end)], curve[end]);
    return scale(delta, 1 / Math.hypot(delta.x, delta.y));
  }
  const circle = arcCircle(curve),
    radial = subtract(point, circle.center);
  const sign = Math.sign(curve.bulge) * (end === "a" ? 1 : -1);
  return scale({ x: -radial.y, y: radial.x }, sign / circle.radius);
}
// Preserve the supporting circle and traversal when shortening a bounded arc.
export function trimRoundingCurve(
  curve: RoundingCurve,
  end: CurveEnd,
  point: Point,
): RoundingCurve | null {
  if (distance(point, curve[farEnd(end)]) < 1e-7) return null;
  if (curve.kind === "segment") return { ...curve, [end]: point };
  if (curve.kind === "bezier") {
    const t = bezierParameter(curve, point);
    return bezierSpan(curve, end === "a" ? t : 0, end === "b" ? t : 1);
  }
  const center = arcCircle(curve).center;
  const a = end === "a" ? point : curve.a,
    b = end === "b" ? point : curve.b;
  const start = Math.atan2(a.y - center.y, a.x - center.x),
    finish = Math.atan2(b.y - center.y, b.x - center.x);
  const sign = Math.sign(arcDomain(curve).sweep);
  return { ...curve, a, b, bulge: Math.tan((sign * positiveAngle(sign * (finish - start))) / 4) };
}
