import type { Vector } from "../sketch/planes.js";

/** Temporary input geometry, in mm. Each mesh is one outward oriented closed manifold. */
export interface MeshFitInput {
  mesh: { vertices: Vector[]; triangles: [number, number, number][] };
  /** A supplied coarse layout of the same genus, already positioned near the target. */
  layout: {
    vertices: Vector[];
    quads: [number, number, number, number][];
    /** Layout vertex pairs allowed to remain sharp; all other joins are checked for smoothness. */
    creases?: [number, number][];
  };
  /** Maximum accepted sampled distance in either direction, in mm. Not a Hausdorff certificate. */
  tolerance: number;
  /** Maximum sampled angle across smooth seams, degrees; default 5, range 0.1–30. */
  smoothAngle?: number;
  /** Initial layout and uniform refinement must fit this budget; default/maximum 256. */
  maxPatches?: number;
}
export type MeshReconstructionInput = Omit<MeshFitInput, "layout">;

export interface MeshFitStatistics {
  /** Present when recovered analytic regions replace the quad network. */
  analyticFaces?: { planes: number; cylinders: number; spheres: number };
  /** Source-vertex distances to the fitted surface, for the import deviation overlay. */
  vertexErrors?: number[];
  patches: number;
  controlPoints: number;
  sampledSurfaceToMesh: number;
  sampledMeshToSurface: number;
  sampledRms: number;
  sampledSeamAngle: number;
  samples: number;
}

export function validateMeshFit(input: MeshFitInput): void {
  if (!input?.mesh || !input.layout) throw new Error("Mesh fitting needs a mesh and quad layout");
  for (const [vertices, faces, arity, limit] of [
    [input.mesh.vertices, input.mesh.triangles, 3, 200000],
    [input.layout.vertices, input.layout.quads, 4, 256],
  ] as const) {
    if (
      !Array.isArray(vertices) ||
      vertices.length < 4 ||
      vertices.length > 100000 ||
      vertices.some(
        (p) =>
          !Array.isArray(p) ||
          p.length !== 3 ||
          p.some((v) => !Number.isFinite(v) || Math.abs(v) > 1e9),
      ) ||
      !Array.isArray(faces) ||
      !faces.length ||
      faces.length > limit ||
      faces.some(
        (f) =>
          !Array.isArray(f) ||
          f.length !== arity ||
          new Set(f).size !== arity ||
          f.some((v) => !Number.isInteger(v) || v < 0 || v >= vertices.length),
      )
    )
      throw new Error("Invalid mesh fitting vertices or face indexes");
  }
  const { tolerance, smoothAngle = 5, maxPatches = 256 } = input;
  if (
    !Number.isFinite(tolerance) ||
    tolerance < 1e-6 ||
    !Number.isFinite(smoothAngle) ||
    smoothAngle < 0.1 ||
    smoothAngle > 30 ||
    !Number.isInteger(maxPatches) ||
    maxPatches < input.layout.quads.length ||
    maxPatches > 256
  )
    throw new Error("Invalid mesh fitting tolerance, smooth angle, or patch budget");
  if (
    input.layout.creases !== undefined &&
    (!Array.isArray(input.layout.creases) ||
      input.layout.creases.length > 1024 ||
      input.layout.creases.some(
        (e) =>
          !Array.isArray(e) ||
          e.length !== 2 ||
          e[0] === e[1] ||
          e.some((v) => !Number.isInteger(v) || v < 0 || v >= input.layout.vertices.length),
      ))
  )
    throw new Error("Invalid mesh fitting crease edges");
}
