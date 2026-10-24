import type { Body } from "../model/body.js";
import type { DisplayDocument } from "../model/display-document.js";
import { exportMesh } from "../model/export-mesh.js";
import type { ExportTiming } from "../model/export-timing.js";
import type { SketchDocument } from "../sketch/document.js";
import { isBuiltinDecorator, knurlDefinition } from "./builtins.js";
import { resolveFaces } from "./cylinder.js";
import { validateThread } from "./edits.js";
import { gearOperands } from "./gear-runtime.js";
import { gearDefinition } from "./gear-settings.js";
import type { JavaScriptDecorators } from "./javascript-hooks.js";
import { knurlOperand } from "./knurl-runtime.js";
import type { MeshOperations, MeshSolid } from "./mesh-operations.js";
import { threadDomain } from "./thread-domain.js";
import { threadMeshes } from "./thread-mesh.js";
import type { ThreadPreviewResolution } from "./thread-sampling.js";
import { threadDefinition, threadSettings } from "./thread-settings.js";
import type { DecoratorInstance } from "./types.js";
export function prepareThreadGeometry(
  document: DisplayDocument,
  instance: DecoratorInstance,
  quality: "preview" | "export",
  previewResolution?: ThreadPreviewResolution,
) {
  if (instance.problem) throw new Error(instance.problem);
  if (instance.definition !== threadDefinition || instance.version !== 1)
    throw new Error(`Unavailable decorator: ${instance.definition} v${instance.version}`);
  validateThread(document, instance);
  const faces = resolveFaces(document.bodies ?? [], instance.faces);
  const body = document.bodies?.find((b) => b.id === instance.faces[0].body);
  if (!body) throw new Error("Thread body is missing");
  const geometry = threadMeshes(
    instance.frame,
    faces,
    threadSettings(instance.settings),
    quality,
    instance.axialReference,
    previewResolution,
  );
  if (!geometry) return null;
  return { body, faces, geometry };
}

function threadOperands<S extends MeshSolid<S>>(
  scope: MeshOperations<S>,
  document: SketchDocument,
  instance: DecoratorInstance,
  quality: "preview" | "export",
) {
  const prepared = prepareThreadGeometry(document, instance, quality);
  if (!prepared) return null;
  const { body, faces, geometry } = prepared;
  const mask = geometry.masks ? threadDomain(scope, body, faces, geometry, true) : null;
  return { mask, geometry };
}

export function decoratedBody<S extends MeshSolid<S>>(
  scope: MeshOperations<S>,
  document: SketchDocument,
  body: Body,
  instances: DecoratorInstance[],
  javascript?: JavaScriptDecorators,
  timing?: ExportTiming,
): S {
  let solid = scope.from(exportMesh(body));
  timing?.mark("baseMesh");
  for (const instance of instances) {
    if (instance.definition === gearDefinition) {
      const operands = gearOperands(scope, document, instance, "export");
      solid = scope.keep(solid.subtract(operands.remove()));
      solid = scope.keep(solid.add(operands.add()));
      continue;
    }
    if (instance.definition === knurlDefinition) {
      const { tool, operation } = knurlOperand(scope, document, instance);
      solid = scope.keep(operation === "add" ? solid.add(tool) : solid.subtract(tool));
      continue;
    }
    if (!isBuiltinDecorator(instance.definition)) {
      if (instance.problem) throw new Error(instance.problem);
      if (!javascript)
        throw new Error(`Enable bundled code for ${instance.definition} before export`);
      for (const modification of javascript.modifications(document, instance)) {
        const operand = scope.from(modification.mesh);
        solid = scope.keep(
          modification.operation === "add" ? solid.add(operand) : solid.subtract(operand),
        );
      }
      continue;
    }
    const operands = threadOperands(scope, document, instance, "export");
    if (!operands) continue;
    const { mask, geometry } = operands;
    const direct = geometry.direct;
    if (direct) {
      let tool = scope.from(direct.mesh);
      if (mask) tool = scope.keep(tool.intersect(mask));
      solid = scope.keep(direct.operation === "add" ? solid.add(tool) : solid.subtract(tool));
      continue;
    }
    const generated = scope.from(geometry.fill);
    if (geometry.hasRemove) {
      let remove = scope.keep(scope.from(geometry.referenceRemove).subtract(generated));
      remove = scope.keep(remove.intersect(scope.from(geometry.removeBand)));
      if (mask) remove = scope.keep(remove.intersect(mask));
      solid = scope.keep(solid.subtract(remove));
    }
    if (geometry.hasAdd) {
      let add = scope.keep(generated.subtract(scope.from(geometry.referenceAdd)));
      add = scope.keep(add.intersect(scope.from(geometry.addBand)));
      if (mask) add = scope.keep(add.intersect(mask));
      solid = scope.keep(solid.add(add));
    }
  }
  return solid;
}
