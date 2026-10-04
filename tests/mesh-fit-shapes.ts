import type { MeshFitInput } from "../src/model/mesh-fit.js";
import type { Vector } from "../src/sketch/planes.js";
import { cubeGrid, sphereFit, torusLayout, triangulate } from "./mesh-fit-fixtures.js";

export function smoothShape(map: (v: Vector) => Vector, layoutResolution = 1): MeshFitInput {
  const mapped = (p: Vector) => map(p.map((v) => v / Math.hypot(...p)) as Vector);
  return {
    mesh: triangulate(cubeGrid(20, mapped)),
    layout: cubeGrid(layoutResolution, mapped),
    tolerance: 0.15,
    maxPatches: 96,
  };
}
export function cylinderFit(): MeshFitInput {
  const map = ([x, y, z]: Vector): Vector => [
    10 * x * Math.sqrt(1 - (y * y) / 2),
    10 * y * Math.sqrt(1 - (x * x) / 2),
    10 * z,
  ];
  const layout = cubeGrid(1, map),
    pairs = new Map<string, [number, number]>();
  for (const f of layout.quads)
    for (let i = 0; i < 4; i++) {
      const a = f[i],
        b = f[(i + 1) % 4];
      if (layout.vertices[a][2] !== layout.vertices[b][2]) continue;
      const pair = [a, b].sort((a, b) => a - b) as [number, number];
      pairs.set(pair.join(","), pair);
    }
  layout.creases = [...pairs.values()];
  return { mesh: triangulate(cubeGrid(20, map)), layout, tolerance: 0.15, maxPatches: 96 };
}
export function noisySphere(): MeshFitInput {
  const input = sphereFit();
  input.mesh.vertices = input.mesh.vertices.map(
    (p, i) => p.map((v) => v * (1 + 0.001 * Math.sin(i * 17.13))) as Vector,
  );
  return input;
}
export function nonuniformSphere(): MeshFitInput {
  const input = sphereFit();
  input.mesh = triangulate(
    cubeGrid(24, (p) => {
      const warped = p.map((v) => Math.sign(v) * Math.abs(v) ** 1.7);
      return warped.map((v) => (10 * v) / Math.hypot(...warped)) as Vector;
    }),
  );
  return input;
}
export function smallHoleTorus(): MeshFitInput {
  return {
    mesh: triangulate(torusLayout(10, 9, 64, 32)),
    layout: torusLayout(10, 9, 16, 8),
    tolerance: 0.15,
    maxPatches: 128,
  };
}
export function transformed(input: MeshFitInput, scale: number, translation: Vector): MeshFitInput {
  const map = ([x, y, z]: Vector): Vector => [
    (x * 0.8 - y * 0.6) * scale + translation[0],
    (x * 0.6 + y * 0.8) * scale + translation[1],
    z * scale + translation[2],
  ];
  return {
    ...input,
    tolerance: input.tolerance * scale,
    mesh: { ...input.mesh, vertices: input.mesh.vertices.map(map) },
    layout: { ...input.layout, vertices: input.layout.vertices.map(map) },
  };
}
