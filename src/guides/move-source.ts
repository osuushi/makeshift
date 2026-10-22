import type { ScaleSource } from "../model/scale.js";
import { scaleSelection } from "../model/scale-selection.js";
import type { SketchEditor } from "../sketch/editor.js";
import { type Vector, worldPoint } from "../sketch/planes.js";
import type { GuideToolInput } from "./tool-path.js";
import type { GuideAnchor } from "./types.js";

/** Move uses the actual selection; a direct guide drag otherwise moves its owner. */
export function guideMoveSource(editor: SketchEditor, anchor: GuideAnchor): ScaleSource | null {
  if (!editor.world.active && editor.modeling.tool && editor.modeling.tool !== "move") return null;
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

/** Freeze the active operation before the drag acquires any destination. */
export function guideDragSource(
  editor: SketchEditor,
  anchor: GuideAnchor,
  point: Vector,
  input: GuideToolInput,
) {
  const tool = !editor.world.active ? editor.modeling.tool : null;
  const plan = tool === "offset" || tool === "extrude" ? input(point) : null;
  const source = plan ? null : guideMoveSource(editor, anchor);
  if (!source && !plan) return null;
  const sketchPlane = source?.kind === "curves" ? editor.sketch?.plane : undefined;
  let origin = point;
  if (sketchPlane) {
    const screen = editor.world.project(origin);
    const local = editor.world.pointAt(sketchPlane, screen.x, screen.y);
    if (!local) return null;
    origin = worldPoint(sketchPlane, local);
  }
  return { source, origin, sketchPlane, plan: plan ?? undefined };
}
