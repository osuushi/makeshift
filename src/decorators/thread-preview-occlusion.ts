import type { BodyGeometry, Face } from "../model/body.js";
import { exportMesh } from "../model/export-mesh.js";
import type { Vector } from "../sketch/planes.js";
import { cross, dot, subtract } from "./cylinder.js";
import type { MeshScope } from "./mesh-scope.js";
import { threadDomain } from "./thread-domain.js";
import type { threadMeshes } from "./thread-mesh.js";
import { planarThreadBoundary } from "./thread-planar-boundary.js";

/** Preserve the remaining flat as an occluder, while exposing its groove openings.
 * Hiding the entire original flat would reveal the far side of the thread. */
export function threadFlatOcclusion(
  scope: MeshScope,
  body: BodyGeometry,
  faces: readonly Face[],
  geometry: NonNullable<ReturnType<typeof threadMeshes>>,
) {
  if (!geometry.extendPlanarCuts) return undefined;
  const flats = faces.flatMap((face) => planarThreadBoundary(body, face) ?? []);
  if (!flats.length) return undefined;
  const operand = geometry.direct;
  if (!operand) return undefined;
  const domain = threadDomain(scope, body, faces, geometry, true);
  const cut = scope.keep(scope.from(operand.mesh).intersect(domain));
  const mesh = scope.mesh(scope.keep(scope.from(exportMesh(body)).subtract(cut)));
  const planes = flats.flatMap((face) =>
    face.plane ? [{ origin: face.plane.origin, normal: cross(face.plane.u, face.plane.v) }] : [],
  );
  return {
    vertices: mesh.vertices,
    triangles: mesh.triangles.filter((triangle) =>
      planes.some(({ origin, normal }) =>
        triangle.every(
          (index) => Math.abs(dot(normal, subtract(mesh.vertices[index] as Vector, origin))) < 1e-5,
        ),
      ),
    ),
  };
}
