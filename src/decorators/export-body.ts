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
import { threadMeshes } from "./thread-mesh.js";
import { threadOperands } from "./thread-operands.js";
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
    const prepared = prepareThreadGeometry(document, instance, "export");
    if (!prepared) continue;
    const { remove, add } = threadOperands(scope, body, prepared.faces, prepared.geometry);
    if (remove) solid = scope.keep(solid.subtract(remove));
    if (add) solid = scope.keep(solid.add(add));
  }
  return solid;
}
