import type { Curve, PointReference, Sketch } from "./document.js";
import { coincidentPoints } from "./line-edit.js";
import type { Point } from "./planes.js";
import { fusePoints } from "./point-links.js";
import { distance } from "./point-math.js";
import { endpointKey, linkedPointCoordinate } from "./point-reference.js";

export function newTrimEndpoints(source: Curve, pieces: Curve[]) {
  return pieces.flatMap((curve) =>
    curve.kind === "circle"
      ? []
      : (["a", "b"] as const)
          .filter(
            (end) =>
              source.kind === "circle" ||
              [source.a, source.b].every((p) => distance(p, curve[end]) > 1e-7),
          )
          .map((end) => ({ curve: curve.id, end, coordinate: curve[end] })),
  );
}

/** Only new, unambiguous endpoint junctions created by this rewrite become fused. */
export function fuseTrimCorners(
  changed: Sketch,
  created: (PointReference & { coordinate: Point })[],
): Sketch {
  const endpoints = changed.curves.flatMap((curve): PointReference[] =>
    curve.kind === "circle" ? [] : (["a", "b"] as const).map((end) => ({ curve: curve.id, end })),
  );
  let result = changed;
  for (const point of endpoints) {
    const coordinate = linkedPointCoordinate(changed, point);
    if (
      !created.some(
        (p) =>
          p.curve === point.curve &&
          p.end === point.end &&
          distance(p.coordinate, coordinate) <= 1e-7,
      )
    )
      continue;
    const meeting = endpoints.filter(
      (other) =>
        other.curve !== point.curve &&
        distance(coordinate, linkedPointCoordinate(changed, other)) <= 1e-7,
    );
    if (meeting.length !== 1) continue;
    result = fusePoints(result, [point, meeting[0]]);
    const junction = coincidentPoints(result, point);
    // The new endpoint join already enforces incidence on either joined edge.
    // Keeping that weaker equation as well makes the native solve redundant.
    result = {
      ...result,
      constraints: result.constraints.filter(
        (c) =>
          c.kind !== "point-on-edge" ||
          !junction.some((p) => endpointKey(p) === endpointKey(c.point)) ||
          !junction.some((p) => p.curve === c.edge && p.end !== "center"),
      ),
    };
  }
  return result;
}
