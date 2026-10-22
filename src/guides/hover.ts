import type { SketchEditor } from "../sketch/editor.js";
import { type Point, worldPoint } from "../sketch/planes.js";
import { hitIds } from "../sketch/sketch-hit.js";
import { commonGuide, type GuideCandidate, guideCandidates } from "./candidates.js";
import { near } from "./geometry.js";

/** Automatic discovery follows the ordinary click target, never its entire boundary. */
export function hoverGuides(editor: SketchEditor, pointer: Point | null): GuideCandidate[] {
  if (!pointer) return [];
  let candidates: GuideCandidate[];
  if (editor.world.active) {
    const hit = editor.hover,
      sketch = editor.sketch;
    if (!hit || !sketch || !["curve", "endpoint", "midpoint", "handle"].includes(hit.kind))
      return [];
    candidates = guideCandidates(editor.display, [], { sketch: sketch.id, curves: hitIds(hit) });
    if (hit.kind === "endpoint")
      candidates = candidates.filter(
        (p) =>
          p.anchor.kind === "sketch-curve" &&
          p.anchor.feature === (hit.endpoint.end === "a" ? "start" : "end"),
      );
    else if (hit.kind === "midpoint")
      candidates = candidates.filter(
        (p) => p.anchor.kind === "sketch-curve" && p.anchor.feature === "midpoint",
      );
    else if (hit.kind === "handle")
      candidates = candidates.filter((p) => near(p.point, worldPoint(sketch.plane, hit.point)));
  } else {
    const hit = editor.modeling.hover;
    if (!hit || (hit.kind !== "edge" && hit.kind !== "sketch")) return [];
    candidates = guideCandidates(editor.display, [hit]);
  }
  const nearby = candidates
    .filter(commonGuide)
    .map((candidate) => {
      const p = editor.world.project(candidate.point);
      return { candidate, distance: Math.hypot(p.x - pointer.x, p.y - pointer.y) };
    })
    .filter((p) => p.distance <= 12)
    .sort((a, b) => a.distance - b.distance);
  const first = nearby[0]?.candidate;
  // Keep semantic alternatives at the same location, not other nearby landmarks.
  return first
    ? nearby.filter((p) => near(p.candidate.point, first.point)).map((p) => p.candidate)
    : [];
}
