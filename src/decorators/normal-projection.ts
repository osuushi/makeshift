import * as THREE from "three";
import type { DisplayDocument } from "../model/display-document.js";
import { normalChart } from "./normal-projection-charts.js";
import { NormalProjectionRays } from "./normal-projection-rays.js";
import type { PackedPreviewMesh } from "./preview-wire.js";
import type { FaceReference } from "./types.js";

export interface PackedNormalProjection {
  body: string;
  face: string;
  positions: Float32Array;
  uv: Float32Array;
  normals: Uint8Array;
  size: number;
  wrap: boolean;
  mipmaps: boolean;
}

/** Bake off the UI thread, once per generated result, never once per camera frame. */
export function projectPreviewNormals(
  document: DisplayDocument,
  mesh: PackedPreviewMesh & { faces: FaceReference[] },
  size = 512,
): PackedNormalProjection[] {
  if (mesh.indices.length < 3) return [];
  const rays = new NormalProjectionRays(mesh);
  const point = new THREE.Vector3(),
    normal = new THREE.Vector3();
  return mesh.faces.flatMap((reference) => {
    const face = document.bodies
      ?.find((body) => body.id === reference.body)
      ?.faces.find((face) => face.id === reference.face);
    if (!face?.vertices.length) return [];
    if (face.vertices.length / 9 > 65536)
      throw new Error(
        "Texture projection supports up to 65,536 triangles per face. Use Geometry for this face.",
      );
    const chart = normalChart(face, size);
    const normals = new Uint8Array(chart.size * chart.size * 4);
    for (let y = 0; y < chart.size; y++)
      for (let x = 0; x < chart.size; x++) {
        chart.sample((x + 0.5) / chart.size, (y + 0.5) / chart.size, point, normal);
        const projected = rays.normal(point, normal);
        const offset = (y * chart.size + x) * 4;
        normals[offset] = Math.round((projected.x * 0.5 + 0.5) * 255);
        normals[offset + 1] = Math.round((projected.y * 0.5 + 0.5) * 255);
        normals[offset + 2] = Math.round((projected.z * 0.5 + 0.5) * 255);
        normals[offset + 3] = 255;
      }
    return [
      {
        ...reference,
        positions: new Float32Array(face.vertices),
        uv: chart.uv,
        normals,
        size: chart.size,
        wrap: !!(face.cylinder || face.cone),
        mipmaps: !!(face.plane || face.cylinder || face.cone),
      },
    ];
  });
}
