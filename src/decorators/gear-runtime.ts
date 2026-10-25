import type { ManifoldToplevel } from "manifold-3d";
import type { DisplayDocument } from "../model/display-document.js";
import { gearMeshes } from "./gear-mesh.js";
import type { MeshOperations, MeshSolid } from "./mesh-operations.js";
import { MeshScope } from "./mesh-scope.js";
import { threadDomain } from "./thread-domain.js";
import type { DecoratorInstance } from "./types.js";

export function gearOperands<S extends MeshSolid<S>>(
  scope: MeshOperations<S>,
  document: DisplayDocument,
  instance: DecoratorInstance,
  quality: "preview" | "export",
) {
  const { geometry, body, faces } = gearMeshes(document, instance, quality);
  const mask = threadDomain(scope, body, faces, geometry);
  const profile = scope.from(geometry.fill);
  const fill =
    geometry.outward > 0 ? profile : scope.keep(scope.from(geometry.band).subtract(profile));
  const envelope = scope.from(geometry.envelope);
  return {
    preview: () => scope.keep(fill.intersect(mask)),
    remove: () =>
      scope.keep(
        scope
          .keep(scope.keep(scope.from(geometry.referenceRemove).subtract(fill)).intersect(mask))
          .intersect(envelope),
      ),
    add: () =>
      scope.keep(
        scope
          .keep(scope.keep(fill.subtract(scope.from(geometry.referenceAdd))).intersect(mask))
          .intersect(envelope),
      ),
  };
}

export function gearPreview(
  runtime: ManifoldToplevel,
  document: DisplayDocument,
  instance: DecoratorInstance,
) {
  const scope = new MeshScope(runtime, instance.frame.origin);
  try {
    return scope.mesh(gearOperands(scope, document, instance, "preview").preview());
  } finally {
    scope.close();
  }
}
