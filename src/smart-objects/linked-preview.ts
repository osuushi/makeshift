import { type Affine, affinePoint } from "../model/affine.js";
import type { DisplayDocument } from "../model/display-document.js";
import type { PreviewGeometry } from "../model/overlap-geometry.js";
import { resolvePlacements } from "../model/smart-object.js";
import { displayPoints } from "../sketch/curve-geometry.js";
import type { SketchEditor } from "../sketch/editor.js";
import { type Vector, worldPoint } from "../sketch/planes.js";

/** Placed geometry for operand highlights and the standard Move projection shadows. */
export function linkedPreview(
  editor: SketchEditor,
  ids: readonly string[],
  document: DisplayDocument = editor.store.data,
): PreviewGeometry {
  const result: PreviewGeometry = { surfaces: [], lines: [] };
  const roots = document.smartObjects?.filter(({ id }) => ids.includes(id)) ?? [];
  const lookup = (id: string) =>
    editor.store.linkedBenches?.find((bench) => bench.id === id)?.display;
  const tolerance = editor.world.height / editor.world.canvas.clientHeight;
  for (const { source, transform } of resolvePlacements(roots, lookup)) {
    const bench = lookup(source);
    if (!bench) continue;
    for (const sketch of bench.sketches)
      for (const curve of sketch.curves)
        result.lines.push(
          displayPoints(curve, tolerance).map((point) =>
            affinePoint(transform, worldPoint(sketch.plane, point)),
          ),
        );
    if (!editor.bodiesVisible) continue;
    for (const body of bench.bodies ?? []) {
      for (const { vertices } of body.faces) {
        for (let i = 0; i < vertices.length; i += 9)
          result.surfaces.push(
            [i, i + 3, i + 6].map((index) => vertex(vertices, index, transform)),
          );
      }
      for (const edge of body.edges) {
        const line: Vector[] = [];
        for (let i = 0; i < edge.points.length; i += 3)
          line.push(vertex(edge.points, i, transform));
        result.lines.push(line);
      }
    }
  }
  return result;
}

function vertex(values: readonly number[], index: number, transform: Affine): Vector {
  return affinePoint(transform, [values[index], values[index + 1], values[index + 2]]);
}
