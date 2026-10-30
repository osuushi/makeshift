import type { ExportMesh } from "../model/export-mesh.js";
import type { PlaneFrame } from "../sketch/planes.js";
import { cylinderPoint } from "./cylinder.js";
import type { Point } from "./thread-grid.js";

/** Close a cylindrical profile at its axis without a degenerate inner skin. */
export function radialVolume(
  frame: PlaneFrame,
  coordinates: Point[],
  sides: number[][],
  radius: (angle: number, z: number) => number,
): ExportMesh {
  const vertices = coordinates.map(({ angle, z }) =>
    cylinderPoint(frame, angle, z, radius(angle, z)),
  );
  const triangles = sides.map((triangle) => [...triangle]);
  const edges = new Map<string, { a: number; b: number; count: number }>();
  for (const [a, b, c] of sides)
    for (const [x, y] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const key = x < y ? `${x}/${y}` : `${y}/${x}`;
      const edge = edges.get(key);
      if (edge) edge.count++;
      else edges.set(key, { a: x, b: y, count: 1 });
    }
  const low = coordinates.reduce((value, point) => Math.min(value, point.z), Infinity);
  const high = coordinates.reduce((value, point) => Math.max(value, point.z), -Infinity);
  const centers = new Map<number, number>();
  for (const { a, b, count } of edges.values()) {
    if (count !== 1) continue;
    // Profile intersections can differ by a few ulps along the same end ring.
    // Each end must share one axis vertex, independent of that rounding.
    const z = coordinates[a].z - low < high - coordinates[a].z ? low : high;
    let center = centers.get(z);
    if (center === undefined) {
      center = vertices.length;
      vertices.push(cylinderPoint(frame, 0, z, 0));
      centers.set(z, center);
    }
    triangles.push([b, a, center]);
  }
  return { vertices, triangles };
}
