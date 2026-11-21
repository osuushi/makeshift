import { curveBounds } from "../sketch/curve-geometry.js";
import type { SketchEditor } from "../sketch/editor.js";
import { type PlaneFrame, type Vector, worldPoint } from "../sketch/planes.js";
import { worldCurveBounds } from "../sketch/world-curve-bounds.js";
import { linkedSelectionBounds } from "../smart-objects/selection-bounds.js";
import type { ScaleSource } from "./scale.js";
import { boundsPoints } from "./smart-object-bounds.js";

export interface TransformBox {
  min: Vector;
  max: Vector;
  frame: PlaneFrame | null;
}
export interface BoxHandle {
  key: string;
  point: Vector;
  axes: number[];
}
export function boxWorld(box: TransformBox, point: Vector): Vector {
  return box.frame ? worldPoint(box.frame, { x: point[0], y: point[1] }) : point;
}
export function boxLocal(box: TransformBox, point: Vector): Vector {
  const frame = box.frame;
  if (!frame) return [...point];
  const delta = point.map((x, i) => x - frame.origin[i]);
  return [
    delta.reduce((s, x, i) => s + x * frame.u[i], 0),
    delta.reduce((s, x, i) => s + x * frame.v[i], 0),
    0,
  ];
}
export function selectionBox(editor: SketchEditor, source: ScaleSource): TransformBox | null {
  const document = editor.store.data;
  const points: Vector[] = [];
  let frame: PlaneFrame | null = null;
  if (source.kind === "curves" || source.kind === "sketches") {
    for (const sketch of document.sketches) {
      if (
        source.kind === "curves" ? sketch.id !== source.sketchId : !source.ids.includes(sketch.id)
      )
        continue;
      if (source.kind === "curves") frame = sketch.plane;
      for (const curve of sketch.curves) {
        if (source.kind === "curves" && !source.ids.includes(curve.id)) continue;
        if (frame) for (const p of curveBounds(curve)) points.push([p.x, p.y, 0]);
        else points.push(...worldCurveBounds(curve, sketch.plane));
      }
    }
  } else {
    if (source.smartObjectIds?.length) {
      const bounds = linkedSelectionBounds(editor, source.smartObjectIds);
      if (!bounds.isEmpty()) points.push(...boundsPoints(bounds));
    }
    for (const body of document.bodies ?? []) {
      if (source.ids.includes(body.id)) {
        points.push(body.bounds.slice(0, 3) as Vector, body.bounds.slice(3, 6) as Vector);
        continue;
      }
      const coordinates = [
        ...body.faces
          .filter((f) => source.faces.some((t) => t.body === body.id && t.face === f.id))
          .flatMap((f) => f.vertices),
        ...body.edges
          .filter((e) => source.edges.some((t) => t.body === body.id && t.edge === e.id))
          .flatMap((e) => e.points),
      ];
      for (let i = 0; i < coordinates.length; i += 3)
        points.push(coordinates.slice(i, i + 3) as Vector);
    }
  }
  if (!points.length) return null;
  return {
    frame,
    min: [0, 1, 2].map((i) => Math.min(...points.map((p) => p[i]))) as Vector,
    max: [0, 1, 2].map((i) => Math.max(...points.map((p) => p[i]))) as Vector,
  };
}
export function boxHandles(box: TransformBox): BoxHandle[] {
  const active = [0, 1, 2].filter((i) => box.max[i] - box.min[i] > 1e-8);
  const result: BoxHandle[] = [];
  for (let x = -1; x <= 1; x++)
    for (let y = -1; y <= 1; y++)
      for (let z = -1; z <= 1; z++) {
        const signs = [x, y, z];
        if (signs.some((s, i) => s !== 0 && !active.includes(i))) continue;
        const axes = active.filter((i) => signs[i] !== 0);
        if (!axes.length) continue;
        result.push({
          key: signs.join(","),
          axes,
          point: signs.map((s, i) =>
            s < 0 ? box.min[i] : s > 0 ? box.max[i] : (box.min[i] + box.max[i]) / 2,
          ) as Vector,
        });
      }
  return result;
}
export function boxEdges(box: TransformBox): [Vector, Vector][] {
  const active = [0, 1, 2].filter((i) => box.max[i] - box.min[i] > 1e-8);
  const corners = boxHandles(box).filter((h) => h.axes.length === active.length);
  return corners.flatMap((a, i) =>
    corners
      .slice(i + 1)
      .flatMap((b): [Vector, Vector][] =>
        active.filter((axis) => a.point[axis] !== b.point[axis]).length === 1
          ? [[a.point, b.point]]
          : [],
      ),
  );
}
