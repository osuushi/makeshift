import { bezierAt, bezierDerivative } from "./bezier-geometry.js";
import type { Bezier, Circle, Segment } from "./document.js";
import type { Point } from "./planes.js";
import { add, distance, dot, scale, subtract } from "./point-math.js";

export interface CubicOffset {
  kind: "cubic-offset";
  curve: Bezier;
  offset: number;
}

function offsetAt(locus: CubicOffset, t: number): { center: Point; contact: Point } {
  let d = bezierDerivative(locus.curve, t);
  if (Math.hypot(d.x, d.y) < 1e-12) d = bezierDerivative(locus.curve, t < 0.5 ? 1e-6 : 1 - 1e-6);
  const normal = scale({ x: -d.y, y: d.x }, locus.offset / Math.hypot(d.x, d.y));
  const contact = bezierAt(locus.curve, t);
  return { center: add(contact, normal), contact };
}

// Intersect the true normal offset, never a tessellation used as accepted geometry.
// Bracket roots along the bounded cubic, then refine to the sketch tolerance.
export function cubicOffsetContacts(locus: CubicOffset, support: Circle | Segment) {
  const residual = (t: number): number => {
    const { center } = offsetAt(locus, t);
    if (support.kind === "circle") return distance(center, support.center) - support.radius;
    const delta = subtract(support.b, support.a);
    return (
      dot(subtract(center, support.a), { x: -delta.y, y: delta.x }) / Math.hypot(delta.x, delta.y)
    );
  };
  const parameters: number[] = [];
  // Include fine endpoint intervals for very small fillets.
  const stops = [
    ...new Set([
      ...Array.from({ length: 65 }, (_, i) => i / 64),
      ...[1e-8, 1e-6, 1e-4, 1e-3].flatMap((t) => [t, 1 - t]),
    ]),
  ].sort((a, b) => a - b);
  let low = stops[0],
    value = residual(low);
  for (const high of stops.slice(1)) {
    const next = residual(high);
    if (Math.abs(value) < 1e-9) parameters.push(low);
    if (value * next < 0) {
      let a = low,
        b = high,
        va = value;
      for (let i = 0; i < 44; i++) {
        const mid = (a + b) / 2,
          vm = residual(mid);
        if (va * vm <= 0) b = mid;
        else {
          a = mid;
          va = vm;
        }
      }
      parameters.push((a + b) / 2);
    }
    low = high;
    value = next;
  }
  if (Math.abs(value) < 1e-9) parameters.push(1);
  return parameters.map((t) => offsetAt(locus, t));
}
