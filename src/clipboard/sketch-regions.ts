import { arcDomain } from "../sketch/arc-geometry.js";
import type { CurveSpan } from "../sketch/curve-spans.js";
import { newId, type Sketch } from "../sketch/document.js";
import { profilesFor } from "../sketch/profiles.js";
import { spanCurve } from "../sketch/trim-geometry.js";

/** Copy bounded spans, not the unselected continuations of their source curves. */
export function copyRegions(sketch: Sketch, keys: ReadonlySet<string>): Sketch {
  const spans = profilesFor(sketch)
    .filter((profile) => keys.has(profile.key))
    .flatMap((profile) => [profile.outer, ...profile.holes].flat());
  const unique = new Map<string, CurveSpan>();
  for (const span of spans) {
    const low = Math.min(span.start, span.end),
      high = Math.max(span.start, span.end);
    unique.set(`${span.curve.id}:${low}:${high}`, span);
  }
  return {
    ...sketch,
    curves: [...unique.values()].map((span) => {
      const curve = span.curve;
      const domain = curve.kind === "arc" ? arcDomain(curve) : null;
      const parameter = (t: number) =>
        domain
          ? (t - domain.start) / domain.sweep
          : curve.kind === "circle"
            ? t / (2 * Math.PI)
            : t;
      const a = parameter(span.start),
        b = parameter(span.end);
      return spanCurve({ curve, start: Math.min(a, b), end: Math.max(a, b) }, newId());
    }),
    constraints: [],
    groups: [],
  };
}
