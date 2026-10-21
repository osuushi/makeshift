import { displayPoints } from "../sketch/curve-geometry.js";
import type { SketchEditor } from "../sketch/editor.js";
import { planeCorners } from "../sketch/plane-bounds.js";
import type { Vector } from "../sketch/planes.js";
import { worldPoint } from "../sketch/planes.js";
import { hitIds } from "../sketch/sketch-hit.js";
import { featureEdges } from "./feature-edges.js";
import type { OverlapTarget } from "./overlap-candidates.js";
import { overlapRegionGeometry } from "./overlap-regions.js";
import { sketchPreviewLines } from "./overlap-sketches.js";

export interface PreviewGeometry {
  surfaces: Vector[][];
  lines: Vector[][];
}
const points = (values: number[]): Vector[] => {
  const result: Vector[] = [];
  for (let i = 0; i < values.length; i += 3) result.push([values[i], values[i + 1], values[i + 2]]);
  return result;
};
export function overlapGeometry(editor: SketchEditor, target?: OverlapTarget): PreviewGeometry {
  const result: PreviewGeometry = { surfaces: [], lines: [] };
  if (target?.kind === "sketch-hit") {
    const sketch = editor.display.sketches.find((s) => s.id === target.sketch);
    if (sketch)
      result.lines = sketch.curves
        .filter((curve) => hitIds(target.hit).includes(curve.id))
        .map((curve) =>
          displayPoints(curve, editor.world.height / editor.world.canvas.clientHeight).map(
            (point) => worldPoint(sketch.plane, point),
          ),
        );
    return result;
  }
  if (target?.kind === "profile" || target?.kind === "profiles")
    return overlapRegionGeometry(editor, target);
  if (target?.kind === "sketch") {
    const sketch = editor.display.sketches.find((s) => s.id === target.sketch);
    if (sketch && editor.visibility.visible(sketch.id))
      result.lines = sketchPreviewLines(editor, sketch);
    return result;
  }
  if (target?.kind === "plane") {
    const corners = planeCorners(target.frame, editor.world.planeBounds(target.frame));
    return { surfaces: [corners], lines: [[...corners, corners[0]]] };
  }
  for (const body of editor.display.bodies ?? []) {
    if (
      !editor.bodiesVisible ||
      !editor.visibility.visible(body.id) ||
      (target && target.body !== body.id)
    )
      continue;
    for (const face of body.faces) {
      if (target?.kind === "edge" || (target?.kind === "face" && target.face !== face.id)) continue;
      const vertices = points(face.vertices);
      for (let i = 0; i < vertices.length; i += 3) result.surfaces.push(vertices.slice(i, i + 3));
    }
    for (const edge of featureEdges(body)) {
      if (target?.kind === "edge" && target.edge !== edge.id) continue;
      if (
        target?.kind === "face" &&
        !body.faces.find((f) => f.id === target.face)?.edges.includes(edge.id)
      )
        continue;
      result.lines.push(points(edge.points));
    }
  }
  return result;
}
