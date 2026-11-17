import type { Arc, Circle, Segment } from "./document.js";
import type { Point } from "./planes.js";
import { add, distance, dot, midpoint, scale, subtract } from "./point-math.js";

export const turn = 2 * Math.PI;
export const positiveAngle = (angle: number): number => ((angle % turn) + turn) % turn;
// Bulge is signed tan(sweep/4). Endpoints + bulge are the sole stored geometry;
// center/radius/angles are evaluated, never independently writable duplicates.
export function arcCircle(arc: Arc): Circle {
  const chord = subtract(arc.b, arc.a),
    length = distance(arc.a, arc.b);
  const offset = (1 - arc.bulge ** 2) / (4 * arc.bulge);
  return {
    id: arc.id,
    kind: "circle",
    construction: arc.construction,
    center: add(midpoint(arc.a, arc.b), { x: -chord.y * offset, y: chord.x * offset }),
    radius: (length * (1 + arc.bulge ** 2)) / (4 * Math.abs(arc.bulge)),
  };
}
export function arcDomain(arc: Arc): { start: number; sweep: number } {
  const { center } = arcCircle(arc);
  return {
    start: Math.atan2(arc.a.y - center.y, arc.a.x - center.x),
    sweep: 4 * Math.atan(arc.bulge),
  };
}
export function arcParameter(arc: Arc, angle: number): number {
  const { start, sweep } = arcDomain(arc);
  return positiveAngle(Math.sign(sweep) * (angle - start));
}
export function onArc(arc: Arc, point: Point, tolerance = 1e-7): boolean {
  if (distance(point, arc.a) <= tolerance || distance(point, arc.b) <= tolerance) return true;
  const circle = arcCircle(arc),
    { sweep } = arcDomain(arc);
  const angle = Math.atan2(point.y - circle.center.y, point.x - circle.center.x);
  return (
    Math.abs(distance(point, circle.center) - circle.radius) <= tolerance &&
    arcParameter(arc, angle) <= Math.abs(sweep) + tolerance / circle.radius
  );
}
export function arcAt(arc: Arc, fraction: number): Point {
  if (fraction === 0) return arc.a;
  if (fraction === 1) return arc.b;
  const circle = arcCircle(arc),
    domain = arcDomain(arc);
  const angle = domain.start + domain.sweep * fraction;
  return add(circle.center, {
    x: circle.radius * Math.cos(angle),
    y: circle.radius * Math.sin(angle),
  });
}
export function bowThrough(curve: Segment | Arc, point: Point): Segment | Arc {
  const chord = subtract(curve.b, curve.a),
    length = distance(curve.a, curve.b);
  if (length < 1e-8) throw new Error("An arc needs distinct endpoints");
  const u = scale(chord, 1 / length),
    relative = subtract(point, curve.a);
  const x = dot(relative, u),
    y = dot(relative, { x: -u.y, y: u.x });
  const base = { id: curve.id, a: curve.a, b: curve.b, construction: curve.construction };
  if (Math.abs(y) < 1e-7) return { ...base, kind: "segment" };
  const centerY = (x * x - length * x + y * y) / (2 * y);
  const radius = Math.hypot(length / 2, centerY);
  // Stable shallow branch avoids subtracting nearly equal large radii.
  const sagitta =
    Math.sign(y) * centerY > 0
      ? Math.abs(centerY) + radius
      : (length * length) / 4 / (radius + Math.abs(centerY));
  return { ...base, kind: "arc", bulge: (-Math.sign(y) * 2 * sagitta) / length };
}
export function bowRadius(curve: Segment | Arc, radius: number, side: number): Arc {
  const direction = radius < 0 ? -1 : 1;
  radius = Math.abs(radius);
  const half = distance(curve.a, curve.b) / 2;
  if (!Number.isFinite(radius) || radius < half || half < 1e-8)
    throw new Error(
      `Radius magnitude must be at least ${half.toFixed(4)} mm (half the endpoint distance)`,
    );
  const minor = half / (radius + Math.sqrt(Math.max(0, radius * radius - half * half)));
  const major =
    curve.kind === "arc" && (Math.abs(curve.bulge) > 1 || curve.semicircleBranch === "major");
  return {
    id: curve.id,
    kind: "arc",
    a: curve.a,
    b: curve.b,
    construction: curve.construction,
    ...(major && radius === half ? { semicircleBranch: "major" as const } : {}),
    bulge:
      direction *
      (curve.kind === "arc" ? Math.sign(curve.bulge) * (major ? 1 / minor : minor) : -side * minor),
  };
}
