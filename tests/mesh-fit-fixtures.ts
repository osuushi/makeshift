import type { MeshFitInput } from "../src/model/mesh-fit.js";
import type { Vector } from "../src/sketch/planes.js";

type Quad = [number, number, number, number];
export const cubeCorners: Vector[] = [
  [-1, -1, -1],
  [1, -1, -1],
  [1, 1, -1],
  [-1, 1, -1],
  [-1, -1, 1],
  [1, -1, 1],
  [1, 1, 1],
  [-1, 1, 1],
];
export const cubeQuads: Quad[] = [
  [0, 3, 2, 1],
  [4, 5, 6, 7],
  [0, 1, 5, 4],
  [1, 2, 6, 5],
  [2, 3, 7, 6],
  [3, 0, 4, 7],
];

export function cubeGrid(resolution: number, map: (v: Vector) => Vector): MeshFitInput["layout"] {
  const vertices: Vector[] = [],
    quads: Quad[] = [],
    ids = new Map<string, number>();
  const vertex = (p: Vector) => {
    const key = p.map((v) => v.toFixed(10)).join(",");
    const found = ids.get(key);
    if (found !== undefined) return found;
    const id = vertices.length;
    ids.set(key, id);
    vertices.push(map(p));
    return id;
  };
  for (const f of cubeQuads) {
    const grid: number[][] = [];
    for (let i = 0; i <= resolution; i++) {
      grid[i] = [];
      for (let j = 0; j <= resolution; j++) {
        const u = i / resolution,
          v = j / resolution;
        grid[i][j] = vertex(
          [0, 1, 2].map(
            (d) =>
              cubeCorners[f[0]][d] * (1 - u) * (1 - v) +
              cubeCorners[f[1]][d] * u * (1 - v) +
              cubeCorners[f[2]][d] * u * v +
              cubeCorners[f[3]][d] * (1 - u) * v,
          ) as Vector,
        );
      }
    }
    for (let i = 0; i < resolution; i++)
      for (let j = 0; j < resolution; j++)
        quads.push([grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]]);
  }
  return { vertices, quads };
}
export function triangulate(layout: MeshFitInput["layout"]): MeshFitInput["mesh"] {
  return {
    vertices: layout.vertices,
    triangles: layout.quads.flatMap(
      ([a, b, c, d]) =>
        [
          [a, b, c],
          [a, c, d],
        ] as [number, number, number][],
    ),
  };
}
export function sharpBox(size = 10): MeshFitInput {
  const layout = cubeGrid(1, (p) => p.map((v) => v * size) as Vector);
  const edges = new Map<string, [number, number]>();
  for (const f of layout.quads)
    for (let i = 0; i < 4; i++) {
      const e = [f[i], f[(i + 1) % 4]].sort((a, b) => a - b) as [number, number];
      edges.set(e.join(","), e);
    }
  layout.creases = [...edges.values()];
  return {
    mesh: triangulate(cubeGrid(4, (p) => p.map((v) => v * size) as Vector)),
    layout,
    tolerance: 0.001,
    maxPatches: 6,
  };
}
export function sphereFit(radii: Vector = [10, 10, 10], resolution = 16): MeshFitInput {
  const map = (p: Vector) => p.map((v, i) => (v / Math.hypot(...p)) * radii[i]) as Vector;
  return {
    mesh: triangulate(cubeGrid(resolution, map)),
    layout: cubeGrid(1, map),
    tolerance: 0.15,
    maxPatches: 96,
  };
}
export function torusLayout(
  major: number,
  minor: number,
  around: number,
  tube: number,
): MeshFitInput["layout"] {
  const vertices: Vector[] = [],
    quads: Quad[] = [];
  for (let i = 0; i < around; i++)
    for (let j = 0; j < tube; j++) {
      const u = (i * 2 * Math.PI) / around,
        v = (j * 2 * Math.PI) / tube;
      vertices.push([
        (major + minor * Math.cos(v)) * Math.cos(u),
        (major + minor * Math.cos(v)) * Math.sin(u),
        minor * Math.sin(v),
      ]);
    }
  const at = (i: number, j: number) => (i % around) * tube + (j % tube);
  for (let i = 0; i < around; i++)
    for (let j = 0; j < tube; j++)
      quads.push([at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]);
  return { vertices, quads };
}
export function torusFit(): MeshFitInput {
  return {
    mesh: triangulate(torusLayout(20, 6, 64, 32)),
    layout: torusLayout(20, 6, 8, 4),
    tolerance: 0.15,
    maxPatches: 128,
  };
}
