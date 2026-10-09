import { arcDomain } from "./arc-geometry.js";
import { type CurveSpan, curvePoint, regionTolerance } from "./curve-spans.js";
import type { Sketch } from "./document.js";
import { distance } from "./point-math.js";
import { profilesFor } from "./profiles.js";
import { trimOverlappingSketch } from "./trim-edit.js";
import type { TrimSpan } from "./trim-geometry.js";

interface Boundary {
  span: CurveSpan;
  faces: Set<string>;
}
function sameSpan(a: CurveSpan, b: CurveSpan): boolean {
  const point = (s: CurveSpan, t: number) => curvePoint(s.curve, s.start + t * (s.end - s.start));
  const close = (t: number, u: number) => distance(point(a, t), point(b, u)) <= regionTolerance;
  return (
    close(0.5, 0.5) &&
    ((close(0, 0) && close(0.25, 0.25) && close(0.75, 0.75) && close(1, 1)) ||
      (close(0, 1) && close(0.25, 0.75) && close(0.75, 0.25) && close(1, 0)))
  );
}
function trimSpan(span: CurveSpan): TrimSpan {
  const { curve } = span;
  const parameter = (t: number) => {
    if (curve.kind === "circle") return t / (2 * Math.PI);
    if (curve.kind === "arc") {
      const { start, sweep } = arcDomain(curve);
      return (t - start) / sweep;
    }
    return t;
  };
  const a = parameter(span.start),
    b = parameter(span.end);
  return { curve, start: Math.min(a, b), end: Math.max(a, b) };
}

/** Remove selected boundaries without connecting any unselected face to the exterior. */
export function deleteProfiles(sketch: Sketch, keys: readonly string[]) {
  const profiles = profilesFor(sketch);
  const selected = new Set(keys);
  if (!selected.size || keys.some((key) => !profiles.some((profile) => profile.key === key)))
    throw new Error("A selected sketch region no longer exists");
  const boundaries: Boundary[] = [];
  for (const profile of profiles) {
    for (const span of [profile.outer, ...profile.holes].flat()) {
      let boundary = boundaries.find((b) => sameSpan(b.span, span));
      if (!boundary) {
        boundary = { span, faces: new Set() };
        boundaries.push(boundary);
      }
      boundary.faces.add(profile.key);
    }
  }
  // Missing second incidence is the unbounded face. Flood only selected faces:
  // these may open to the outside; all other faces must stay bounded.
  const outside = new Set<string>();
  const candidates = boundaries.filter((b) => [...b.faces].some((f) => selected.has(f)));
  for (const boundary of candidates)
    if (boundary.faces.size === 1) for (const face of boundary.faces) outside.add(face);
  let changed = true;
  while (changed) {
    changed = false;
    for (const boundary of candidates) {
      if (![...boundary.faces].some((f) => outside.has(f))) continue;
      for (const face of boundary.faces) {
        if (!selected.has(face) || outside.has(face)) continue;
        outside.add(face);
        changed = true;
      }
    }
  }
  const spans = candidates
    .filter(
      (b) =>
        !([...b.faces].some((f) => outside.has(f)) && [...b.faces].some((f) => !selected.has(f))),
    )
    .map((b) => trimSpan(b.span));
  return trimOverlappingSketch(sketch, spans, true);
}
