export const meshFitTypes = `
export interface MeshFitInput {
  mesh: { vertices: Vector[]; triangles: [number, number, number][] };
  layout: { vertices: Vector[]; quads: [number, number, number, number][]; creases?: [number, number][] };
  /** Sampled bidirectional surface error in mm, not a certified global distance bound. */
  tolerance: number;
  /** Maximum sampled smooth-seam normal angle in degrees, default 5, range 0.1–30. */
  smoothAngle?: number;
  /** Default and maximum 256; uniform subdivision multiplies the patch count by four. */
  maxPatches?: number;
}
export interface MeshFitStatistics {
  patches: number; controlPoints: number; samples: number;
  sampledSurfaceToMesh: number; sampledMeshToSurface: number; sampledRms: number;
  sampledSeamAngle: number;
}
export interface MeshFitResult extends SolidResult { fit: MeshFitStatistics }
`;
