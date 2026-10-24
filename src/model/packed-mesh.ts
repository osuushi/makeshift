import { retriangulateCollapsedEdges } from "./collapsed-edge-facets.js";
import { facetArea, retriangulateCollinear } from "./collinear-facets.js";
import type { ExportMesh } from "./export-mesh.js";

/** Collapsed zero-thickness sheets leave identical facets with opposite winding. */
function cancelOppositeFacets(triangles: number[][]): number[][] {
  const waiting = new Map<string, number[]>();
  const cancelled = new Set<number>();
  const key = (triangle: number[]) => {
    const start = triangle.indexOf(Math.min(...triangle));
    return [0, 1, 2].map((offset) => triangle[(start + offset) % 3]).join("/");
  };
  for (let index = 0; index < triangles.length; index++) {
    const triangle = triangles[index];
    const reversed = key([triangle[0], triangle[2], triangle[1]]);
    const opposite = waiting.get(reversed)?.pop();
    if (opposite !== undefined) {
      cancelled.add(opposite);
      cancelled.add(index);
      continue;
    }
    const oriented = key(triangle);
    const candidates = waiting.get(oriented) ?? [];
    candidates.push(index);
    waiting.set(oriented, candidates);
  }
  return triangles.filter((_, index) => !cancelled.has(index));
}

/** Float packing can collapse Boolean slivers. Join short edges within the existing
 * rounding bound, then re-triangulate exact collinearity without moving vertices. */
export function packedMesh(mesh: ExportMesh, rounding: number): ExportMesh {
  const parents = mesh.vertices.map((_, i) => i);
  const root = (i: number): number => {
    let current = i;
    while (parents[current] !== current) current = parents[current];
    while (parents[i] !== i) {
      const next = parents[i];
      parents[i] = current;
      i = next;
    }
    return current;
  };
  const distance = (a: number, b: number) =>
    Math.hypot(...mesh.vertices[a].map((v, i) => v - mesh.vertices[b][i]));
  for (const triangle of mesh.triangles) {
    if (facetArea(mesh, triangle) !== 0) continue;
    const edges = [
      [triangle[0], triangle[1]],
      [triangle[1], triangle[2]],
      [triangle[2], triangle[0]],
    ];
    edges.sort((a, b) => distance(a[0], a[1]) - distance(b[0], b[1]));
    const [a, b] = edges[0];
    if (distance(a, b) > rounding) continue;
    parents[root(b)] = root(a);
  }
  for (let i = 0; i < parents.length; i++)
    if (distance(i, root(i)) > rounding)
      throw new Error("Mesh packing exceeds numerical precision");
  const mapped = mesh.triangles.map((triangle) => triangle.map(root));
  const normalized = retriangulateCollapsedEdges(mesh, mapped, rounding);
  const retriangulated = retriangulateCollinear(normalized, rounding);
  const result = {
    ...retriangulated,
    triangles: cancelOppositeFacets(retriangulated.triangles),
  };
  if (result.triangles.some((triangle) => facetArea(result, triangle) === 0))
    throw new Error("A collapsed mesh facet exceeds numerical precision");
  return result;
}
