import type { OverlapCandidate } from "../model/overlap-candidates.js";
import type { SketchEditor } from "./editor.js";
import { pickCandidates } from "./picking.js";
import type { Point } from "./planes.js";
import { type Hit, hitIds } from "./sketch-hit.js";

export function sketchOverlapChoices(editor: SketchEditor, hits: Hit[]): OverlapCandidate[] {
  const sketch = editor.sketch;
  if (!sketch) return [];
  return hits
    .filter((hit) => hitIds(hit).length > 0)
    .map((hit) => ({
      target: { kind: "sketch-hit", sketch: sketch.id, hit },
      depth: 0,
      key: hitIds(hit).join("/"),
      label:
        hit.kind === "group"
          ? "Rectangle"
          : sketch.curves.find((curve) => curve.id === hitIds(hit)[0])?.kind === "circle"
            ? "Circle"
            : "Curve",
    }));
}
export function sketchHoldChoices(editor: SketchEditor, screen: Point): OverlapCandidate[] {
  return sketchOverlapChoices(editor, pickCandidates(editor, screen));
}
