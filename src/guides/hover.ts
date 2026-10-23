import type { SketchEditor } from "../sketch/editor.js";
import type { Point } from "../sketch/planes.js";
import type { GuideCandidate } from "./candidates.js";
import { hoveredCandidates, selectedCandidates } from "./discovery-sources.js";
import { near } from "./geometry.js";
import { parentClearance } from "./parent-clearance.js";
import { visibleGuides } from "./snapping.js";
import { guideKey, guideOwner } from "./types.js";

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
        Math.hypot(p.x - points[i].x, p.y - points[i].y) >= 48,
    ),
  );
}

function filteredGuides(
  editor: SketchEditor,
  hovered: readonly GuideCandidate[],
  selected: readonly GuideCandidate[],
  saved: readonly GuideCandidate[],
  pointer: Point | null,
): GuideCandidate[] {
  const seen = new Set(saved.map((p) => guideKey(p.anchor)));
  const candidates = [...selected, ...hovered].filter((candidate) => {
    const key = guideKey(candidate.anchor);
    if (
      seen.has(key) ||
      !editor.visibility.visible(guideOwner(candidate.anchor)) ||
      (candidate.anchor.kind !== "sketch-curve" && !editor.bodiesVisible)
    )
      return false;
    seen.add(key);
    const p = editor.world.project(candidate.point);
    return !!pointer && Math.hypot(p.x - pointer.x, p.y - pointer.y) <= 128;
  });
  const spaced = spacedGuides(candidates, saved, (point) => editor.world.project(point));
  const markers = [...spaced, ...saved].map((p) => editor.world.project(p.point));
  return spaced.filter((p) => parentClearance(editor, p.anchor, markers));
}

/** Nearby selection and hover candidates, with stable hover discovery on approach. */
export function hoverGuides(editor: SketchEditor, pointer: Point | null): GuideCandidate[] {
  const saved = visibleGuides(editor).map(({ guide, point }) => ({
    anchor: guide.anchor,
    point,
    label: guide.name,
  }));
  const selected = selectedCandidates(editor);
  const selectedKeys = new Set(selected.map((p) => guideKey(p.anchor)));
  const candidates = filteredGuides(
    editor,
    pointer ? hoveredCandidates(editor) : [],
    selected,
    saved,
    pointer,
  );
  // Probe ordinary geometry, not the overlay itself, without mutating hover/selection.
  const atPoint = new Map<string, Set<string>>();
  return candidates.filter((candidate) => {
    if (selectedKeys.has(guideKey(candidate.anchor))) return true;
    const screen = editor.world.project(candidate.point);
    const location = `${screen.x}:${screen.y}`;
    let keys = atPoint.get(location);
    if (!keys) {
      keys = new Set(
        filteredGuides(editor, hoveredCandidates(editor, screen), selected, saved, screen).map(
          (p) => guideKey(p.anchor),
        ),
      );
      atPoint.set(location, keys);
    }
    return keys.has(guideKey(candidate.anchor));
  });
}
