import type { Manifold } from "manifold-3d";
import type { BodyGeometry, Face } from "../model/body.js";
import { type ExportMesh, exportMesh } from "../model/export-mesh.js";
import type { MeshScope } from "./mesh-scope.js";
import type { threadMeshes } from "./thread-mesh.js";
import { threadOperands } from "./thread-operands.js";

/** Keep Boolean provenance until the preview separates old surfaces from new cuts. */
function surfaceFrom(solid: Manifold, scope: MeshScope, keep: (id: number) => boolean): ExportMesh {
  const mesh = solid.getMesh();
  const vertices: number[][] = [],
    triangles: number[][] = [];
  for (let i = 0; i < mesh.vertProperties.length; i += mesh.numProp)
    vertices.push(
      Array.from(mesh.vertProperties.slice(i, i + 3), (v, axis) => v + scope.origin[axis]),
    );
  for (let run = 0; run < mesh.runOriginalID.length; run++) {
    if (!keep(mesh.runOriginalID[run])) continue;
    for (let i = mesh.runIndex[run]; i < mesh.runIndex[run + 1]; i += 3)
      triangles.push(Array.from(mesh.triVerts.slice(i, i + 3)));
  }
  return { vertices, triangles };
}

/** The whole body can be cut; its remaining original surfaces still occlude the thread. */
export function threadBodyPreview(
  scope: MeshScope,
  body: BodyGeometry,
  faces: readonly Face[],
  geometry: NonNullable<ReturnType<typeof threadMeshes>>,
) {
  const original = scope.keep(scope.from(exportMesh(body)).asOriginal());
  const id = original.originalID();
  const { remove, add } = threadOperands(scope, body, faces, geometry);
  let result = original;
  if (remove) result = scope.keep(result.subtract(remove));
  if (add) result = scope.keep(result.add(add));
  if (result.status() !== "NoError") throw new Error(`Thread preview failed: ${result.status()}`);
  return {
    mesh: surfaceFrom(result, scope, (source) => source !== id),
    occlusion: surfaceFrom(result, scope, (source) => source === id),
  };
}
