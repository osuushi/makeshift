import { curveBounds } from "./curve-geometry.js";
import type { SketchEditor } from "./editor.js";
import { rotationOffset } from "./move-widget/geometry.js";
import type { Point } from "./planes.js";
import { add, midpoint, scale } from "./point-math.js";

import { rectangleFrame } from "./rectangle-edit.js";

export function selectionFrame(
  editor: SketchEditor,
): { center: Point; pivot: Point; handle: Point } | null {
  const sketch = editor.sketch;
  if (!sketch || !editor.selectionOwners.size || editor.tool === "pen") return null;
  const points = editor.moveMode
    ? [
        ...sketch.curves
          .filter((curve) => editor.selectedCurves.has(curve.id))
          .flatMap(curveBounds),
        ...editor.selected.pointHits(editor.sketch).map((hit) => hit.point),
      ]
    : sketch.curves.filter((curve) => editor.selectionOwners.has(curve.id)).flatMap(curveBounds);
  if (!points.length) return null;
  const min = { x: Math.min(...points.map((p) => p.x)), y: Math.min(...points.map((p) => p.y)) };
  const max = { x: Math.max(...points.map((p) => p.x)), y: Math.max(...points.map((p) => p.y)) };
  const center = midpoint(min, max),
    offset = (34 * editor.world.height) / editor.world.canvas.clientHeight;
  let handle = { x: center.x, y: max.y + offset };
  const group = editor.rectangleContext;
  if (group) {
    const frame = rectangleFrame(sketch, group);
    handle = add(midpoint(frame.corners[2], frame.corners[3]), scale(frame.v, offset));
  }
  const pivot = editor.pivot ?? center;
  if (hasTransformWidget(editor))
    handle = {
      x: pivot.x + (rotationOffset * editor.world.height) / editor.world.canvas.clientHeight,
      y: pivot.y + (rotationOffset * editor.world.height) / editor.world.canvas.clientHeight,
    };
  return { center, pivot, handle };
}

export function hasTransformWidget(editor: SketchEditor): boolean {
  if (editor.moveMode && editor.selectionOwners.size) return true;
  return (
    editor.selectionOwners.size > 1 &&
    !editor.rectangleContext &&
    !editor.selected.firstPointKey &&
    !editor.selected.pointKeys?.size &&
    !editor.pointMenu
  );
}
