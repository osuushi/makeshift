import { type CurveSpan, curvePoint, regionTolerance, spanArea } from "./curve-spans.js";
import type { Curve } from "./document.js";
import { distance } from "./point-math.js";
import { closedBoundaries } from "./regions.js";

/** A face walk can revisit a tangent contact, joining an outer loop to a
 * clockwise hole. Nest simple positive loops instead: the hole's interior has
 * its own positive walk, and must not become a child of the adjacent crescent. */
export function profileLoops(curves: readonly Curve[]): CurveSpan[][] {
  const loops: CurveSpan[][] = [];
  for (const boundary of closedBoundaries(curves)) {
    const path: CurveSpan[] = [];
    for (const span of boundary) {
      path.push(span);
      const end = curvePoint(span.curve, span.end);
      const start = path.findIndex(
        (edge) => distance(curvePoint(edge.curve, edge.start), end) <= regionTolerance,
      );
      if (start < 0) continue;
      const loop = path.splice(start);
      if (loop.reduce((area, edge) => area + spanArea(edge), 0) > regionTolerance ** 2)
        loops.push(loop);
    }
  }
  return loops;
}
