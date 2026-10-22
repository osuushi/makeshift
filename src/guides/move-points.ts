import type { DisplayDocument } from "../model/display-document.js";
import type { OverlapTarget } from "../model/overlap-candidates.js";
import type { SketchEditor } from "../sketch/editor.js";
import { planes, type Vector } from "../sketch/planes.js";
import { guideCandidates } from "./candidates.js";
import { resolvedGuides } from "./evaluate.js";
import { type GuideAnchor, guideLabel, guideOwner } from "./types.js";

export interface GuideMovePoint {
  point: Vector;
  label: string;
  reference: OverlapTarget;
  anchor?: GuideAnchor;
  saved: boolean;
}
function reference(anchor: GuideAnchor): OverlapTarget {
  if (anchor.kind === "sketch-curve")
    return {
      kind: "sketch-hit",
      sketch: anchor.sketch,
      hit: { kind: "curve", curve: anchor.curve, point: { x: 0, y: 0 } },
    };
  if (anchor.kind === "body-edge") return { kind: "edge", body: anchor.body, edge: anchor.edge };
  if (anchor.kind === "body-faces" && anchor.faces.length === 1)
    return { kind: "face", body: anchor.body, face: anchor.faces[0] };
  return { kind: "body", body: anchor.body };
}

/** Freeze reference positions at drag start, including points on the moving owner. */
export function guideMovePoints(editor: SketchEditor, document: DisplayDocument): GuideMovePoint[] {
  const visible = (anchor: GuideAnchor) =>
    editor.visibility.visible(guideOwner(anchor)) &&
    (anchor.kind === "sketch-curve" || editor.bodiesVisible);
  const targets = [
    ...document.sketches
      .filter((s) => editor.visibility.visible(s.id))
      .map((s) => ({ kind: "sketch" as const, sketch: s.id })),
    ...(editor.bodiesVisible ? (document.bodies ?? []) : [])
      .filter((b) => editor.visibility.visible(b.id))
      .map((b) => ({ kind: "body" as const, body: b.id })),
  ];
  return [
    ...resolvedGuides(document)
      .filter(({ guide }) => !guide.hidden && visible(guide.anchor))
      .map(({ guide, point }) => ({
        point,
        label: guideLabel(guide),
        reference: reference(guide.anchor),
        anchor: guide.anchor,
        saved: true,
      })),
    {
      point: [0, 0, 0],
      label: "Origin",
      reference: { kind: "plane", frame: planes.XY, world: "XY" },
      saved: true,
    },
    ...guideCandidates(document, targets).map((p) => ({
      ...p,
      reference: reference(p.anchor),
      saved: false,
    })),
  ];
}
