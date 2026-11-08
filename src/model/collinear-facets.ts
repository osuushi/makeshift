import type { ExportMesh } from "./export-mesh.js";

export function facetArea(mesh: ExportMesh, triangle: number[]): number {
  const a = mesh.vertices[triangle[0]],
    b = mesh.vertices[triangle[1]],
    c = mesh.vertices[triangle[2]];
  const ux = b[0] - a[0],
    uy = b[1] - a[1],
    uz = b[2] - a[2];
  const vx = c[0] - a[0],
    vy = c[1] - a[1],
    vz = c[2] - a[2];
  return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
}
const edges = ([a, b, c]: number[]) => [
  [a, b],
  [b, c],
  [c, a],
];

/** An exactly collinear facet can be absorbed by splitting its neighbor at the
 * existing middle vertex. No vertices move and the represented surface is unchanged. */
export function retriangulateCollinear(mesh: ExportMesh, rounding: number): ExportMesh {
  const distance = (a: number, b: number) =>
    Math.hypot(...mesh.vertices[a].map((v, i) => v - mesh.vertices[b][i]));
  const pending = new Set(
    mesh.triangles.flatMap((t, i) =>
      facetArea(mesh, t) === 0 && edges(t).every(([a, b]) => distance(a, b) > rounding) ? [i] : [],
    ),
  );
  if (!pending.size) return mesh;
  const triangles = [...mesh.triangles];
  const adjacency = new Map<string, number>();
  const register = (i: number) => {
    for (const [a, b] of edges(triangles[i])) adjacency.set(`${a}/${b}`, i);
  };
  for (let i = 0; i < triangles.length; i++) register(i);
  let changed = true;
  while (changed && pending.size) {
    changed = false;
    for (const i of pending) {
      const [a, b] = edges(triangles[i]).sort(
        (x, y) => distance(y[0], y[1]) - distance(x[0], x[1]),
      )[0];
      const c = triangles[i].find((v) => v !== a && v !== b);
      const neighbor = adjacency.get(`${b}/${a}`);
      if (c === undefined || neighbor === undefined || neighbor === i) continue;
      const d = triangles[neighbor].find((v) => v !== a && v !== b);
      if (d === undefined || d === c || adjacency.has(`${c}/${d}`) || adjacency.has(`${d}/${c}`))
        continue;
      const replacement = [
        [c, a, d],
        [c, d, b],
      ];
      if (!replacement.every((t) => facetArea(mesh, t) > 0)) continue;
      for (const index of [i, neighbor])
        for (const [x, y] of edges(triangles[index])) adjacency.delete(`${x}/${y}`);
      [triangles[i], triangles[neighbor]] = replacement;
      register(i);
      register(neighbor);
      pending.delete(i);
      pending.delete(neighbor);
      changed = true;
    }
  }
  return { ...mesh, triangles };
}

/** A pair of opposing zero-area facets can bridge two copies of one seam.
 * Join only the coincident middle vertices of that pair and remove the bridge. */
export function joinCollinearSeams(mesh: ExportMesh, collapsed: number[][]): ExportMesh {
  const sides = new Map<string, { middle: number; triangle: number[] }>();
  const removed = new Set<number[]>();
  const parents = new Map<number, number>();
  const root = (index: number): number => {
    let parent = parents.get(index);
    while (parent !== undefined) {
      index = parent;
      parent = parents.get(index);
    }
    return index;
  };
  const length = ([a, b]: number[]) =>
    Math.hypot(...mesh.vertices[a].map((v, axis) => v - mesh.vertices[b][axis]));
  for (const triangle of collapsed) {
    const [a, b] = edges(triangle).sort((x, y) => length(y) - length(x))[0];
    const middle = triangle.find((v) => v !== a && v !== b);
    if (middle === undefined) continue;
    const oppositeKey = `${b}/${a}`;
    const opposite = sides.get(oppositeKey);
    if (
      opposite &&
      mesh.vertices[middle].every((value, axis) => value === mesh.vertices[opposite.middle][axis])
    ) {
      const from = root(middle),
        to = root(opposite.middle);
      if (from !== to) parents.set(from, to);
      removed.add(triangle);
      removed.add(opposite.triangle);
      sides.delete(oppositeKey);
    } else sides.set(`${a}/${b}`, { middle, triangle });
  }
  if (!removed.size) return mesh;
  return {
    ...mesh,
    triangles: mesh.triangles.filter((triangle) => !removed.has(triangle)).map((t) => t.map(root)),
  };
}
