import type { ScaleSource } from "../model/scale.js";
import { scaleSelection } from "../model/scale-selection.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { GuideAnchor } from "./types.js";

/** Move uses the actual selection; a direct guide drag otherwise moves its owner. */
export function guideMoveSource(editor: SketchEditor, anchor: GuideAnchor): ScaleSource | null {
  if (editor.world.active ? editor.moveMode : editor.modeling.tool === "move") {
    const selected = scaleSelection(editor);
    if (selected) return selected;
    if (editor.world.active && editor.sketch && editor.selected.points.length)
      return { kind: "curves", sketchId: editor.sketch.id, ids: [...editor.selectionOwners] };
    return null;
  }
  return anchor.kind === "sketch-curve"
    ? { kind: "sketches", ids: [anchor.sketch] }
    : { kind: "solids", ids: [anchor.body], faces: [], edges: [] };
}
