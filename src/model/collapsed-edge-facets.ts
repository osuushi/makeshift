import type { ExportMesh } from "./export-mesh.js";

const edges = ([a, b, c]: number[]) => [
  [a, b],
  [b, c],
  [c, a],
];
const subtract = (a: number[], b: number[]) => a.map((v, i) => v - b[i]);
const dot = (a: number[], b: number[]) => a.reduce((sum, v, i) => sum + v * b[i], 0);
function normal(vertices: number[][], [a, b, c]: number[]) {
  const u = subtract(vertices[b], vertices[a]),
    v = subtract(vertices[c], vertices[a]);
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
}

/** Both triangulations cover the same convex projection onto the first facet.
 * Only the fourth vertex is off that plane, so its distance bounds the change
 * everywhere on the surface. No vertices move. */
function replacement(
  vertices: number[][],
  first: number[],
  second: number[],
  a: number,
  b: number,
  rounding: number,
) {
  const c = first.find((v) => v !== a && v !== b),
    d = second.find((v) => v !== a && v !== b);
  if (c === undefined || d === undefined || c === d) return null;
  if (
    !edges(first).some(([x, y]) => x === a && y === b) ||
    !edges(second).some(([x, y]) => x === b && y === a)
  )
    return null;
  const n = normal(vertices, first),
    length = Math.hypot(...n);
  const error = Math.abs(dot(n, subtract(vertices[d], vertices[a]))) / length;
  const triangles = [
    [c, a, d],
    [c, d, b],
  ];
  if (
    !Number.isFinite(error) ||
    error > rounding ||
    dot(n, normal(vertices, second)) <= 0 ||
    triangles.some((t) => dot(n, normal(vertices, t)) <= 0)
  )
    return null;
  return { triangles, diagonal: [c, d], error };
}

/** Collapsing an edge can join two formerly distinct edges. Flip an original
 * neighboring facet pair only when the new diagonal is unused and the surface
 * change stays inside the existing rounding bound. Arbitrary nonmanifold input
 * has no pair of distinct original edges to repair and still fails validation. */
export function retriangulateCollapsedEdges(
  source: ExportMesh,
  mapped: number[][],
  rounding: number,
): ExportMesh {
  const active = (t: number[]) => new Set(t).size === 3;
  if (!mapped.some((t, i) => t.some((v, j) => v !== source.triangles[i][j])))
    return { ...source, triangles: mapped.filter(active) };
  const stride = source.vertices.length;
  const key = Number.isSafeInteger(stride * stride)
    ? (a: number, b: number): number | string => Math.min(a, b) * stride + Math.max(a, b)
    : (a: number, b: number): number | string => `${Math.min(a, b)}/${Math.max(a, b)}`;
  const counts = new Map<number | string, number>();
  const count = (t: number[], delta: number) => {
    for (const [a, b] of edges(t)) {
      const edge = key(a, b);
      counts.set(edge, (counts.get(edge) ?? 0) + delta);
    }
  };
  for (const triangle of mapped) if (active(triangle)) count(triangle, 1);
  const crowded = new Set([...counts].filter(([, count]) => count > 2).map(([edge]) => edge));
  if (!crowded.size) return { ...source, triangles: mapped.filter(active) };
  const originals = new Map<number | string, { a: number; b: number; faces: number[] }>();
  for (let i = 0; i < mapped.length; i++) {
    const triangle = source.triangles[i];
    for (let corner = 0; corner < 3; corner++) {
      const next = (corner + 1) % 3;
      if (!crowded.has(key(mapped[i][corner], mapped[i][next]))) continue;
      const edge = key(triangle[corner], triangle[next]);
      const entry = originals.get(edge) ?? { a: mapped[i][corner], b: mapped[i][next], faces: [] };
      entry.faces.push(i);
      originals.set(edge, entry);
    }
  }
  const candidates = [...originals.values()]
    .flatMap(({ a, b, faces }) => {
      if (faces.length !== 2 || faces.some((i) => !active(mapped[i]))) return [];
      const displacement = Math.max(
        ...faces.flatMap((i) =>
          source.triangles[i].map((v, j) =>
            Math.hypot(...subtract(source.vertices[v], source.vertices[mapped[i][j]])),
          ),
        ),
      );
      const patch = replacement(
        source.vertices,
        mapped[faces[0]],
        mapped[faces[1]],
        a,
        b,
        rounding - displacement,
      );
      return patch ? [{ ...patch, a, b, faces }] : [];
    })
    .sort((a, b) => a.error - b.error);
  const triangles = [...mapped];
  for (const candidate of candidates) {
    const { a, b, faces, diagonal } = candidate;
    if (
      (counts.get(key(a, b)) ?? 0) <= 2 ||
      counts.get(key(diagonal[0], diagonal[1])) ||
      faces.some((i) => triangles[i] !== mapped[i])
    )
      continue;
    for (let i = 0; i < 2; i++) {
      count(triangles[faces[i]], -1);
      triangles[faces[i]] = candidate.triangles[i];
      count(triangles[faces[i]], 1);
    }
  }
  return { ...source, triangles: triangles.filter(active) };
}
