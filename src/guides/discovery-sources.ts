import type { SketchEditor } from "../sketch/editor.js";
import { pickModel } from "../sketch/model-selection.js";
import type { ModelingTarget } from "../sketch/model-selection-state.js";
import { pick } from "../sketch/picking.js";
import type { Point } from "../sketch/planes.js";
import { hitIds } from "../sketch/sketch-hit.js";
import { type GuideCandidate, guideCandidates } from "./candidates.js";
import { guidePosition } from "./evaluate.js";
import { type GuideAnchor, guideMeaning } from "./types.js";

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

export function hoveredCandidates(editor: SketchEditor, screen?: Point): GuideCandidate[] {
  if (editor.world.active) {
    const hit = screen ? pick(editor, screen) : editor.hover,
      sketch = editor.sketch;
    if (!hit || !sketch) return [];
    return guideCandidates(editor.display, [], {
      sketch: sketch.id,
      curves: "group" in hit && hit.group ? hit.group.members : hitIds(hit),
    });
  }
  const hit = screen ? pickModel(editor, screen) : editor.modeling.hover;
  return hit ? modelingCandidates(editor, hit) : [];
}

function modelingCandidates(editor: SketchEditor, hit: ModelingTarget): GuideCandidate[] {
  if (!("body" in hit) || hit.kind === "body") return guideCandidates(editor.display, [hit]);
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
  if (point) candidates.push({ anchor, point, label: guideMeaning(anchor) });
  return candidates;
}

export function selectedCandidates(editor: SketchEditor): GuideCandidate[] {
  if (editor.world.active) {
    const sketch = editor.sketch;
    return sketch
      ? guideCandidates(editor.display, [], {
          sketch: sketch.id,
          curves: [...editor.selectionOwners],
        })
      : [];
  }
  return [
    ...editor.modeling.targets.flatMap((target) => modelingCandidates(editor, target)),
    ...guideCandidates(editor.display, editor.modeling.targets),
  ];
}
