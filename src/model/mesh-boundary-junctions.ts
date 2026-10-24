import { facetArea } from "./collinear-facets.js";
import type { ExportMesh } from "./export-mesh.js";

interface Edge {
  a: number;
  b: number;
  triangle: number;
  count: number;
}

/** A mesher can omit a collinear boundary triangle where two circles touch.
 * Split the opposite long edge at the existing middle vertex. Require the
 * complete opposite two-edge path; this cannot fill an ordinary missing face. */
export function stitchBoundaryJunctions(mesh: ExportMesh): ExportMesh {
  const edges = new Map<string, Edge>();
  mesh.triangles.forEach((triangle, index) => {
    for (let i = 0; i < 3; i++) {
      const a = triangle[i],
        b = triangle[(i + 1) % 3];
      const key = `${Math.min(a, b)}/${Math.max(a, b)}`;
      const edge = edges.get(key);
      if (edge) edge.count++;
      else edges.set(key, { a, b, triangle: index, count: 1 });
    }
  });
  const boundary = [...edges.values()].filter((edge) => edge.count === 1);
  const outgoing = new Map<number, Edge[]>();
  for (const edge of boundary) {
    const list = outgoing.get(edge.a) ?? [];
    list.push(edge);
    outgoing.set(edge.a, list);
  }
  const triangles = [...mesh.triangles];
  const used = new Set<Edge>();
  for (const edge of boundary) {
    if (used.has(edge)) continue;
    for (const first of outgoing.get(edge.b) ?? []) {
      const last = outgoing.get(first.b)?.find((candidate) => candidate.b === edge.a);
      if (!last || used.has(first) || used.has(last)) continue;
      const middle = first.b;
      if (!liesOnEdge(mesh, edge.a, middle, edge.b)) continue;
      const triangle = triangles[edge.triangle];
      if (!triangle.includes(edge.a) || !triangle.includes(edge.b)) continue;
      const tip = triangle.find((id) => id !== edge.a && id !== edge.b);
      if (tip === undefined || tip === middle) continue;
      const split = [
        [edge.a, middle, tip],
        [middle, edge.b, tip],
      ];
      if (split.some((triangle) => facetArea(mesh, triangle) === 0)) continue;
      triangles[edge.triangle] = split[0];
      triangles.push(split[1]);
      for (const part of [edge, first, last]) used.add(part);
      break;
    }
  }
  return used.size ? { ...mesh, triangles } : mesh;
}

function liesOnEdge(mesh: ExportMesh, a: number, middle: number, b: number): boolean {
  const start = mesh.vertices[a];
  const u = mesh.vertices[b].map((value, axis) => value - start[axis]);
  const v = mesh.vertices[middle].map((value, axis) => value - start[axis]);
  const length2 = u.reduce((sum, value) => sum + value * value, 0);
  const projection = u.reduce((sum, value, axis) => sum + value * v[axis], 0);
  // Only arithmetic roundoff is allowed, not a geometric welding tolerance.
  const roundoff = 16 * Number.EPSILON * Math.hypot(...u) * Math.hypot(...v);
  return projection > 0 && projection < length2 && facetArea(mesh, [a, middle, b]) <= roundoff;
}
