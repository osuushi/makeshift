import { profileGuides } from "../model/profile-guides.js";
import type { RevolvedProfile } from "../model/revolved-profile.js";
import { bezierBounds, bezierSpan } from "../sketch/bezier-geometry.js";
import { type CurveSpan, curvePoint, regionTolerance } from "../sketch/curve-spans.js";
import { newId, type Segment, type Sketch } from "../sketch/document.js";
import type { Point } from "../sketch/planes.js";
import { type Profile, profilesFor } from "../sketch/profiles.js";
import { boundary } from "./profile-boundary.js";

function radialExtrema({ curve, start, end }: CurveSpan): Point[] {
  if (curve.kind === "bezier") return bezierBounds(bezierSpan(curve, start, end));
  const points = [curvePoint(curve, start), curvePoint(curve, end)];
  if (curve.kind === "segment") return points;
  const low = Math.min(start, end),
    high = Math.max(start, end);
  for (let k = Math.ceil(low / Math.PI); k * Math.PI < high; k++)
    points.push(curvePoint(curve, k * Math.PI));
  return points;
}

export function profileRegion(
  sketch: Sketch,
  limits: Pick<RevolvedProfile, "height" | "endGuides">,
): Profile | undefined {
  const guides = profileGuides(sketch, limits).map(
    ([a, b]): Segment => ({ id: newId(), kind: "segment", a, b, construction: false }),
  );
  const radiusOrder = (radius: number) => Math.round(radius / regionTolerance);
  const regions = profilesFor({ ...sketch, curves: [...sketch.curves, ...guides] }).map(
    (region) => {
      const xs = region.outer.flatMap(radialExtrema).map((point) => point.x);
      const low = Math.min(...xs),
        high = Math.max(...xs);
      return {
        region,
        near: radiusOrder(Math.max(0, low, -high)),
        far: radiusOrder(Math.max(-low, high)),
      };
    },
  );
  regions.sort((a, b) => a.near - b.near || a.far - b.far || b.region.area - a.region.area);
  return regions[0]?.region;
}

export function profileGeometry(
  region: Profile,
  sketch: Sketch,
  origins: ReadonlyMap<string, string>,
) {
  return {
    outer: boundary(region.outer, sketch.plane, origins),
    holes: region.holes.map((hole) => boundary(hole, sketch.plane, origins)),
  };
}

export function profileGeometryKey({ outer, holes }: ReturnType<typeof profileGeometry>): string {
  // A construction edit or a branch can change traversal order and intersection
  // roundoff without changing the region's geometric boundary.
  const loopKey = (loop: typeof outer) =>
    loop
      .map((span) =>
        JSON.stringify(span, (key, value) =>
          key === "face"
            ? undefined
            : typeof value === "number"
              ? Math.round(value / regionTolerance)
              : value,
        ),
      )
      .sort();
  return JSON.stringify([
    loopKey(outer),
    holes.map((hole) => JSON.stringify(loopKey(hole))).sort(),
  ]);
}
