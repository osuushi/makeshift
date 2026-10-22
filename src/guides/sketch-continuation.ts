import { type Curve, newId, type SketchDocument } from "../sketch/document.js";
import { distance } from "../sketch/point-math.js";
import { sketchFeature } from "./geometry.js";
import type { GuidePoint } from "./types.js";

/** Immediate curve rewrite provenance, sent with Trim's ordinary edit intent. */
export interface CurveContinuation {
  source: string;
  curves: readonly string[];
}
export function continueSketchGuides(
  source: SketchDocument,
  candidate: SketchDocument,
  sketchId: string,
  origins: readonly CurveContinuation[],
): SketchDocument {
  if (!source.guidePoints?.length || !origins.length) return candidate;
  const before = source.sketches.find((s) => s.id === sketchId);
  const after = candidate.sketches.find((s) => s.id === sketchId);
  if (!before || !after) return candidate;
  const points = (candidate.guidePoints ?? []).flatMap((guide): GuidePoint[] => {
    const anchor = guide.anchor;
    if (anchor.kind !== "sketch-curve" || anchor.sketch !== sketchId) return [guide];
    const mapped = origins.find((entry) => entry.source === anchor.curve);
    if (!mapped) return [guide];
    const original = before.curves.find((c) => c.id === anchor.curve);
    const old = original && sketchFeature(original, anchor.feature);
    const curves = mapped.curves.flatMap((id) => after.curves.filter((c) => c.id === id));
    for (const curve of curves) {
      if (anchor.feature === "start" || anchor.feature === "end") {
        for (const feature of ["start", "end"] as const) {
          const point = sketchFeature(curve, feature);
          if (point && old && distance(point, old) < 1e-7)
            return [{ ...guide, anchor: { ...anchor, curve: curve.id, feature } }];
        }
      } else if (sketchFeature(curve, anchor.feature))
        return [{ ...guide, anchor: { ...anchor, curve: curve.id } }];
    }
    return [];
  });
  return { ...candidate, guidePoints: points };
}
export function copySketchGuides(
  document: SketchDocument,
  sourceId: string,
  copyId: string,
  ids: Map<string, string>,
): SketchDocument {
  const copies = (document.guidePoints ?? []).flatMap((g): GuidePoint[] => {
    if (g.anchor.kind !== "sketch-curve" || g.anchor.sketch !== sourceId) return [];
    const curve = ids.get(g.anchor.curve);
    if (!curve) return [];
    const id = ids.get(g.id) ?? newId();
    ids.set(g.id, id);
    return [{ ...g, id, anchor: { ...g.anchor, sketch: copyId, curve } }];
  });
  return copies.length
    ? { ...document, guidePoints: [...(document.guidePoints ?? []), ...copies] }
    : document;
}

/** Affine arc replacement retains endpoint meaning across the whole ordered chain. */
export function continueScaledGuides(
  document: SketchDocument,
  sketch: string,
  replacements: ReadonlyMap<string, readonly Curve[]>,
): SketchDocument {
  if (!document.guidePoints?.length || !replacements.size) return document;
  const guidePoints = document.guidePoints.flatMap((guide): GuidePoint[] => {
    const anchor = guide.anchor;
    if (anchor.kind !== "sketch-curve" || anchor.sketch !== sketch) return [guide];
    const pieces = replacements.get(anchor.curve);
    if (!pieces) return [guide];
    // A noncircular replacement has no circle center. Midpoint follows the first descendant.
    if (anchor.feature === "circle-center") return [];
    const curve = anchor.feature === "end" ? pieces.at(-1) : pieces[0];
    return curve ? [{ ...guide, anchor: { ...anchor, curve: curve.id } }] : [];
  });
  return { ...document, guidePoints };
}
