import type { OverlapTarget } from "../model/overlap-candidates.js";
import { overlapGeometry } from "../model/overlap-geometry.js";
import { geometryPreviews } from "../model/overlap-preview.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { GuideMarker } from "./markers.js";
import type { GuideAnchor } from "./types.js";

/** Show all of a meaning's parents, including junction edges and split face groups. */
export function guideMeaningPreviews(editor: SketchEditor, items: GuideMarker[]): SVGSVGElement[] {
  const geometries = items.map(({ anchor }) => {
    const parts = references(anchor).map((target) => overlapGeometry(editor, target));
    return {
      surfaces: parts.flatMap((part) => part.surfaces),
      lines: parts.flatMap((part) => part.lines),
    };
  });
  return geometryPreviews(
    editor,
    geometries,
    items.map((item) => item.point),
  );
}

function references(anchor: GuideAnchor): OverlapTarget[] {
  if (anchor.kind === "sketch-curve")
    return [
      {
        kind: "sketch-hit",
        sketch: anchor.sketch,
        hit: { kind: "curve", curve: anchor.curve, point: { x: 0, y: 0 } },
      },
    ];
  const body = anchor.body;
  if (anchor.kind === "body-edge") return [{ kind: "edge", body, edge: anchor.edge }];
  if (anchor.kind === "body-junction")
    return anchor.edges.map((edge) => ({ kind: "edge", body, edge }));
  if (anchor.kind === "body-faces")
    return anchor.faces.map((face) => ({ kind: "face", body, face }));
  return [{ kind: "body", body }];
}
