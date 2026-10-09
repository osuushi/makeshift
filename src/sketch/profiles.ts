import { arcCircle } from "./arc-geometry.js";
import { bezierPowers } from "./bezier-geometry.js";
import { type CurveSpan, curvePoint, regionTolerance, spanArea } from "./curve-spans.js";
import type { Sketch } from "./document.js";
import type { Point } from "./planes.js";
import { derivative, roots } from "./polynomial.js";
import { closedBoundaries } from "./regions.js";

export interface Profile {
  key: string;
  outer: CurveSpan[];
  holes: CurveSpan[][];
  area: number;
}
/** Ray parity on exact spans; circular spans are split only at Y extrema. */
export function insideBoundary(boundary: readonly CurveSpan[], point: Point): boolean {
  let inside = false;
  // Adjacent spans can evaluate a shared vertex differently within the region
  // tolerance. Use the same side so a ray through it counts one crossing.
  const above = (p: Point) => p.y - point.y > regionTolerance;
  for (const span of boundary) {
    const low = Math.min(span.start, span.end),
      high = Math.max(span.start, span.end);
    const cuts = [low, high];
    if (span.curve.kind === "bezier")
      cuts.push(
        ...roots(derivative(bezierPowers(span.curve, "y"))).filter((t) => t > low && t < high),
      );
    else if (span.curve.kind !== "segment") {
      for (let k = Math.ceil((low - Math.PI / 2) / Math.PI); Math.PI / 2 + k * Math.PI < high; k++)
        cuts.push(Math.PI / 2 + k * Math.PI);
    }
    cuts.sort((a, b) => a - b);
    for (let i = 1; i < cuts.length; i++) {
      const a = curvePoint(span.curve, cuts[i - 1]),
        b = curvePoint(span.curve, cuts[i]);
      if (above(a) === above(b)) continue;
      let x: number;
      if (span.curve.kind === "segment") x = a.x + ((point.y - a.y) * (b.x - a.x)) / (b.y - a.y);
      else if (span.curve.kind === "bezier") {
        let lo = cuts[i - 1],
          hi = cuts[i];
        for (let n = 0; n < 48; n++) {
          const m = (lo + hi) / 2;
          if (above(curvePoint(span.curve, m)) === above(a)) lo = m;
          else hi = m;
        }
        x = curvePoint(span.curve, (lo + hi) / 2).x;
      } else {
        const circle = span.curve.kind === "arc" ? arcCircle(span.curve) : span.curve;
        const dx = Math.sqrt(Math.max(0, circle.radius ** 2 - (point.y - circle.center.y) ** 2));
        x = circle.center.x + Math.sign(Math.cos((cuts[i - 1] + cuts[i]) / 2)) * dx;
      }
      if (x > point.x) inside = !inside;
    }
  }
  return inside;
}
const cache = new WeakMap<Sketch, Profile[]>();
export function profilesFor(sketch: Sketch): Profile[] {
  const previous = cache.get(sketch);
  if (previous) return previous;
  const loops = closedBoundaries(sketch.curves);
  const areas = loops.map((loop) => loop.reduce((sum, span) => sum + spanArea(span), 0));
  const parents = loops.map((loop, index) => {
    const probes = loop.map((span) => curvePoint(span.curve, (span.start + span.end) / 2));
    return loops
      .map((candidate, i) => ({ candidate, i }))
      .filter(
        ({ candidate, i }) =>
          areas[i] > areas[index] + 1e-9 && probes.every((p) => insideBoundary(candidate, p)),
      )
      .sort((a, b) => areas[a.i] - areas[b.i])[0]?.i;
  });
  const profiles = loops.map((outer, index) => {
    const children = loops.map((_, i) => i).filter((i) => parents[i] === index);
    return {
      key: `${sketch.id}/${index}`,
      outer,
      holes: children.map((i) => loops[i]),
      area: areas[index] - children.reduce((sum, i) => sum + areas[i], 0),
    };
  });
  cache.set(sketch, profiles);
  return profiles;
}
export function profileAt(sketch: Sketch, point: Point): Profile | undefined {
  return profilesFor(sketch).find(
    (p) => insideBoundary(p.outer, point) && !p.holes.some((h) => insideBoundary(h, point)),
  );
}
