import { arcCircle } from "./arc-geometry.js";
import type { Arc, TangentConstraint } from "./document.js";
import { distance, dot, scale, subtract } from "./point-math.js";
import type { RoundingCurve } from "./rounding-curves.js";
export function roundingTangentSide(curve: RoundingCurve, arc: Arc): TangentConstraint["side"] {
  if (curve.kind === "bezier") return 1;
  const circle = arcCircle(arc);
  if (curve.kind === "segment") {
    const u = scale(subtract(curve.b, curve.a), 1 / distance(curve.a, curve.b));
    return dot(subtract(circle.center, curve.a), { x: -u.y, y: u.x }) < 0 ? -1 : 1;
  }
  const support = arcCircle(curve);
  const d = distance(support.center, circle.center);
  if (Math.abs(d - support.radius - circle.radius) < 1e-6) return "external";
  return support.radius > circle.radius ? "a-contains-b" : "b-contains-a";
}
