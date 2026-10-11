import type { SketchEditor } from "../sketch/editor.js";
import { type Vector, worldPoint } from "../sketch/planes.js";
import { selectionFrame } from "../sketch/selection-frame.js";
import type { ScaleSource } from "./scale.js";
import { selectionAnchor } from "./selection-anchor.js";
import { boxLocal, boxWorld, type TransformBox } from "./transform-box.js";

export function scaleSelection(editor: SketchEditor): ScaleSource | null {
  if (editor.world.active) {
    const ids = [...editor.selectedCurves];
    return editor.sketch && ids.length && !editor.selected.points.length
      ? { kind: "curves", sketchId: editor.sketch.id, ids }
      : null;
  }
  const targets = editor.modeling.targets;
  if (targets.length && targets.every((t) => t.kind === "sketch"))
    return { kind: "sketches", ids: [...new Set(targets.map((t) => t.sketch))] };
  const result = editor.modeling.resolve("scale");
  return result.available
    ? {
        kind: "solids",
        ids: result.inputs.bodies.map((b) => b.id),
        faces: result.inputs.faces,
        edges: result.inputs.edges,
      }
    : null;
}
export function scalePivot(editor: SketchEditor): Vector {
  const frame = selectionFrame(editor);
  return editor.world.active && editor.sketch && frame
    ? worldPoint(editor.sketch.plane, frame.center)
    : selectionAnchor(editor);
}

export function selectScaledCurves(
  editor: SketchEditor,
  source: Extract<ScaleSource, { kind: "curves" }>,
  originalIds: Set<string>,
): void {
  const sketch = editor.store.data.sketches.find((s) => s.id === source.sketchId);
  const curves = sketch?.curves ?? [];
  const ids = source.ids.flatMap((id) => {
    const start = curves.findIndex((curve) => curve.id === id);
    if (start < 0) return [];
    const pieces = [id];
    for (let i = start + 1; i < curves.length && !originalIds.has(curves[i].id); i++)
      pieces.push(curves[i].id);
    return pieces;
  });
  editor.select(ids);
}

export function scaleNumericPivot(box: TransformBox, pivot: Vector, factors: Vector): Vector {
  const local = boxLocal(box, pivot);
  return boxWorld(
    box,
    local.map((value, i) =>
      Number.isFinite(factors[i]) && factors[i] !== 1 ? box.min[i] : value,
    ) as Vector,
  );
}
