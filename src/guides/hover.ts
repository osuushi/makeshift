import type { SketchEditor } from "../sketch/editor.js";
import type { ModelingTarget } from "../sketch/model-selection-state.js";
import type { Point } from "../sketch/planes.js";
import { hitIds } from "../sketch/sketch-hit.js";
import { type GuideCandidate, guideCandidates } from "./candidates.js";
import { guidePosition } from "./evaluate.js";
import { near } from "./geometry.js";
import { parentClearance } from "./parent-clearance.js";
import { visibleGuides } from "./snapping.js";
import { type GuideAnchor, guideKey, guideMeaning, guideOwner } from "./types.js";

function parentNearHover(editor: SketchEditor, anchor: GuideAnchor, hit: ModelingTarget): boolean {
  if (anchor.kind === "sketch-curve") return hit.sketch === anchor.sketch;
  if (!("body" in hit) || hit.body !== anchor.body) return false;
  if (anchor.kind === "body-center") return true;
  const body = editor.display.bodies?.find((b) => b.id === anchor.body);
  const edges =
    hit.kind === "edge"
      ? [hit.edge]
      : hit.kind === "face"
        ? (body?.faces.find((f) => f.id === hit.face)?.edges ?? [])
        : [];
  if (anchor.kind === "body-edge") return edges.includes(anchor.edge);
  if (anchor.kind === "body-junction") return anchor.edges.some((id) => edges.includes(id));
  if (hit.kind === "body") return true;
  if (hit.kind === "face") return anchor.faces.includes(hit.face);
  return (
    hit.kind === "edge" &&
    !!body?.faces.some((f) => anchor.faces.includes(f.id) && f.edges.includes(hit.edge))
  );
}

function hoveredCandidates(editor: SketchEditor): GuideCandidate[] {
  if (editor.world.active) {
    const hit = editor.hover,
      sketch = editor.sketch;
    if (!hit || !sketch) return [];
    return guideCandidates(editor.display, [], {
      sketch: sketch.id,
      curves: "group" in hit && hit.group ? hit.group.members : hitIds(hit),
    });
  }
  const hit = editor.modeling.hover;
  if (!hit) return [];
  if (!("body" in hit)) return guideCandidates(editor.display, [hit]);
  const body = editor.display.bodies?.find((b) => b.id === hit.body);
  if (!body) return [];
  const targets: ModelingTarget[] = [hit];
  if (hit.kind === "edge")
    for (const face of body.faces)
      if (face.edges.includes(hit.edge))
        targets.push({ kind: "face", body: body.id, face: face.id });
  const candidates = guideCandidates(editor.display, targets).filter((p) =>
    parentNearHover(editor, p.anchor, hit),
  );
  const anchor: GuideAnchor = { kind: "body-center", body: body.id, feature: "bounds-center" };
  const point = guidePosition(editor.display, anchor);
  if (point && hit.kind !== "body") candidates.push({ anchor, point, label: guideMeaning(anchor) });
  return candidates;
}

/** Coincident definitions share a marker; distinct crowded points cull both sides. */
export function spacedGuides(
  candidates: readonly GuideCandidate[],
  saved: readonly GuideCandidate[],
  project: (point: GuideCandidate["point"]) => Point,
): GuideCandidate[] {
  const points = [...candidates, ...saved].map((p) => project(p.point));
  return candidates.filter((_, i) =>
    points.every(
      (p, j) =>
        i === j ||
        (j < candidates.length && near(candidates[i].point, candidates[j].point)) ||
        Math.hypot(p.x - points[i].x, p.y - points[i].y) >= 32,
    ),
  );
}

/** Hovered graph neighbors, proximity, spacing, then room to select every parent. */
export function hoverGuides(editor: SketchEditor, pointer: Point | null): GuideCandidate[] {
  if (!pointer) return [];
  const saved = visibleGuides(editor).map(({ guide, point }) => ({
    anchor: guide.anchor,
    point,
    label: guide.name,
  }));
  const keys = new Set(saved.map((p) => guideKey(p.anchor)));
  const candidates = hoveredCandidates(editor).filter((candidate) => {
    if (
      keys.has(guideKey(candidate.anchor)) ||
      !editor.visibility.visible(guideOwner(candidate.anchor)) ||
      (candidate.anchor.kind !== "sketch-curve" && !editor.bodiesVisible)
    )
      return false;
    const p = editor.world.project(candidate.point);
    return Math.hypot(p.x - pointer.x, p.y - pointer.y) <= 256;
  });
  const spaced = spacedGuides(candidates, saved, (point) => editor.world.project(point));
  const markers = [...spaced, ...saved].map((p) => editor.world.project(p.point));
  return spaced.filter((p) => parentClearance(editor, p.anchor, markers));
}
