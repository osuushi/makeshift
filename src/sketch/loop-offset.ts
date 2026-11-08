import { arcCircle, arcDomain, positiveAngle } from "./arc-geometry.js";
import { supportIntersections } from "./curve-intersections.js";
import { type LoopEdge, loopArea, simpleBoundary } from "./loop-boundary.js";
import { offsetCurve } from "./offset-geometry.js";
import type { Point } from "./planes.js";
import { distance, dot, midpoint, subtract } from "./point-math.js";

const endpointJoinToleranceMm = 1e-7;
const ambiguousJoinDistanceMm = 1e-7;
const minimumEdgeLengthMm = 1e-7;
const minimumArcSweepRadians = 1e-7;
const semicircleToleranceRadians = 1e-10;
const minimumLoopAreaMm2 = 1e-7;

function join(a: LoopEdge, b: LoopEdge, corner: Point): Point {
  if (distance(a.b, b.a) < endpointJoinToleranceMm) return midpoint(a.b, b.a);
  const options = supportIntersections(a, b).sort(
    (p, q) => distance(p, corner) - distance(q, corner),
  );
  if (!options.length)
    throw new Error("Offset edges have no sharp intersection; try a smaller distance");
  if (
    options.length > 1 &&
    Math.abs(distance(options[0], corner) - distance(options[1], corner)) < ambiguousJoinDistanceMm
  )
    throw new Error("Offset corner has two ambiguous joins");
  return options[0];
}
function joinedEdge(curve: LoopEdge, a: Point, b: Point): LoopEdge {
  if (distance(a, b) < minimumEdgeLengthMm) throw new Error("Offset collapses an edge");
  if (curve.kind === "segment") {
    if (dot(subtract(b, a), subtract(curve.b, curve.a)) <= 0)
      throw new Error("Offset would reverse an edge");
    return { ...curve, a, b };
  }
  const circle = arcCircle(curve),
    sign = Math.sign(curve.bulge);
  const angle = (p: Point) => Math.atan2(p.y - circle.center.y, p.x - circle.center.x);
  const sweep = sign * positiveAngle(sign * (angle(b) - angle(a)));
  if (
    Math.abs(sweep) < minimumArcSweepRadians ||
    Math.abs(sweep - arcDomain(curve).sweep) > Math.PI
  )
    throw new Error("Offset would collapse or wrap an arc");
  const semicircle = Math.abs(Math.abs(sweep) - Math.PI) < semicircleToleranceRadians;
  return {
    id: curve.id,
    kind: "arc",
    construction: curve.construction,
    a,
    b,
    bulge: semicircle ? sign : Math.tan(sweep / 4),
    ...(semicircle && (Math.abs(curve.bulge) > 1 || curve.semicircleBranch === "major")
      ? { semicircleBranch: "major" as const }
      : {}),
  };
}
export function offsetLoop(
  loop: readonly LoopEdge[],
  amount: number,
  ids: readonly string[],
): LoopEdge[] {
  const copies = loop.map((curve, i) => {
    const copied = offsetCurve(
      curve,
      amount * (curve.kind === "segment" ? -1 : Math.sign(curve.bulge)),
      ids[i],
    );
    if (copied.kind === "circle" || copied.kind === "bezier")
      throw new Error("Expected a bounded loop edge");
    return copied;
  });
  const corners = copies.map((curve, i) => join(curve, copies[(i + 1) % copies.length], loop[i].b));
  const result = copies.map((curve, i) =>
    joinedEdge(curve, corners[(i + copies.length - 1) % copies.length], corners[i]),
  );
  simpleBoundary(result);
  if (
    loopArea(result) <= minimumLoopAreaMm2 ||
    Math.sign(loopArea(result) - loopArea(loop)) !== Math.sign(amount)
  )
    throw new Error("Offset collapses or inverts the loop");
  return result;
}
