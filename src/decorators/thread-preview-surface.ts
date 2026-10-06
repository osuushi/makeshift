import type { Face } from "../model/body.js";
import type { ExportMesh } from "../model/export-mesh.js";
import type { PlaneFrame, Vector } from "../sketch/planes.js";
import { cross, dot, subtract } from "./cylinder.js";

/** Closure facets are needed for volume clipping, but are not threaded surfaces. */
export function threadPreviewSurface(
  mesh: ExportMesh,
  frame: PlaneFrame,
  faces: readonly Face[],
  adjacent: readonly Face[],
): ExportMesh {
  const planes = adjacent.flatMap((face) => {
    if (
      !face.plane ||
      !faces.some((support) => support.edges.some((id) => face.edges.includes(id)))
    )
      return [];
    return [{ origin: face.plane.origin, normal: cross(face.plane.u, face.plane.v) }];
  });
  // Axis is the saved frame normal, not a face's potentially reversed cylinder axis.
  const axis = cross(frame.u, frame.v);
  return {
    vertices: mesh.vertices,
    triangles: mesh.triangles.filter((triangle) => {
      const points = triangle.map((index) => mesh.vertices[index] as Vector);
      const levels = points.map((point) => dot(axis, subtract(point, frame.origin)));
      if (Math.max(...levels) - Math.min(...levels) < 1e-7) return false;
      return !planes.some(({ normal, origin }) =>
        points.every((point) => Math.abs(dot(normal, subtract(point, origin))) < 1e-7),
      );
    }),
  };
}
