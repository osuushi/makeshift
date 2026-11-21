import { boundaryPoints } from "../sketch/curve-spans.js";
import type { SketchEditor } from "../sketch/editor.js";
import { type Vector, worldPoint } from "../sketch/planes.js";
import { sketchCenter } from "../sketch/sketch-placement.js";

export function selectionAnchor(editor: SketchEditor): Vector {
  const points: Vector[] = [];
  for (const target of editor.modeling.targets) {
    if (target.kind === "body") {
      const body = editor.store.data.bodies?.find((b) => b.id === target.body);
      if (body) points.push(body.bounds.slice(0, 3) as Vector, body.bounds.slice(3, 6) as Vector);
      continue;
    }
    if (target.kind === "edge") {
      const edge = editor.store.data.bodies
        ?.flatMap((b) => b.edges)
        .find((e) => e.id === target.edge);
      if (edge)
        for (let i = 0; i < edge.points.length; i += 3)
          points.push(edge.points.slice(i, i + 3) as Vector);
      continue;
    }
    if (target.kind === "face") {
      const face = editor.store.data.bodies
        ?.flatMap((b) => b.faces)
        .find((f) => f.id === target.face);
      if (face)
        for (let i = 0; i < face.vertices.length; i += 3)
          points.push([face.vertices[i], face.vertices[i + 1], face.vertices[i + 2]]);
      continue;
    }
    if (target.kind === "smart-object") continue;
    const sketch = editor.store.data.sketches.find((s) => s.id === target.sketch);
    if (!sketch) continue;
    if (target.kind === "sketch") points.push(sketchCenter(sketch));
    else
      points.push(
        ...boundaryPoints(target.profile.outer, 1).map((p) => worldPoint(sketch.plane, p)),
      );
  }
  if (!points.length) return [0, 0, 0];
  return [0, 1, 2].map((axis) => {
    let low = Infinity,
      high = -Infinity;
    for (const point of points) {
      low = Math.min(low, point[axis]);
      high = Math.max(high, point[axis]);
    }
    return (low + high) / 2;
  }) as Vector;
}
