import type { ExportMesh } from "../model/export-mesh.js";
import type { PackedNormalProjection } from "./normal-projection.js";

export interface PackedPreviewMesh {
  positions: Float32Array;
  indices: Uint32Array;
  occlusion?: { positions: Float32Array; indices: Uint32Array };
  projections?: PackedNormalProjection[];
}

/** Transfer compact buffers instead of cloning nested triangle arrays. */
export function packPreviewMesh(mesh: ExportMesh): PackedPreviewMesh {
  const positions = new Float32Array(mesh.vertices.length * 3);
  for (let i = 0; i < mesh.vertices.length; i++) positions.set(mesh.vertices[i], i * 3);
  const indices = new Uint32Array(mesh.triangles.length * 3);
  for (let i = 0; i < mesh.triangles.length; i++) indices.set(mesh.triangles[i], i * 3);
  return { positions, indices };
}

export function previewMeshTransfers(mesh: PackedPreviewMesh): ArrayBufferLike[] {
  return [
    mesh.positions.buffer,
    mesh.indices.buffer,
    ...(mesh.projections ?? []).flatMap((projection) => [
      projection.positions.buffer,
      projection.uv.buffer,
      projection.normals.buffer,
    ]),
    ...(mesh.occlusion ? [mesh.occlusion.positions.buffer, mesh.occlusion.indices.buffer] : []),
  ];
}
