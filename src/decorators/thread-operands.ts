import type { BodyGeometry, Face } from "../model/body.js";
import type { MeshOperations, MeshSolid } from "./mesh-operations.js";
import { threadDomain } from "./thread-domain.js";
import type { threadMeshes } from "./thread-mesh.js";

/** Cuts belong to the body; only added material is clipped to selected face domains. */
export function threadOperands<S extends MeshSolid<S>>(
  scope: MeshOperations<S>,
  body: BodyGeometry,
  faces: readonly Face[],
  geometry: NonNullable<ReturnType<typeof threadMeshes>>,
) {
  const cut = geometry.cut;
  const remove = cut ? scope.from(cut) : null;
  let add: S | null = null;
  if (geometry.hasAdd) {
    add = scope.keep(scope.from(geometry.fill).subtract(scope.from(geometry.referenceAdd)));
    add = scope.keep(add.intersect(scope.from(geometry.addBand)));
    if (geometry.masks) add = scope.keep(add.intersect(threadDomain(scope, body, faces, geometry)));
  }
  return { remove, add };
}
