import { closestOnCurve } from "./curve-geometry.js";
import { offsetFrame } from "./offset-geometry.js";
import type { OffsetTarget } from "./offset-target.js";
import type { Point } from "./planes.js";
import { distance, scale } from "./point-math.js";

/** The displayed handle follows the nearest source edge, including after panel movement. */
export function offsetHandleFrame(target: OffsetTarget, position: Point) {
  const boundary = target.boundary ??
    target.loop?.map((curve) => ({
      curve,
      direction: curve.kind === "segment" ? -1 : Math.sign(curve.bulge),
    })) ?? [target];
  const nearest = boundary.reduce((best, edge) =>
    distance(position, closestOnCurve(edge.curve, position)) <
    distance(position, closestOnCurve(best.curve, position))
      ? edge
      : best,
  );
  const frame = offsetFrame(nearest.curve, position);
  return { point: frame.point, normal: scale(frame.normal, nearest.direction) };
}
