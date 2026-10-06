import type { ManifoldToplevel } from "manifold-3d";
import type { DisplayDocument } from "../model/display-document.js";
import { type ExportMesh, exportMesh } from "../model/export-mesh.js";
import type { SketchDocument } from "../sketch/document.js";
import { knurlDefinition } from "./builtins.js";
import { decoratedBody, prepareThreadGeometry } from "./export-body.js";
import type { JavaScriptDecorators } from "./javascript-hooks.js";
import { knurlPreview } from "./knurl-runtime.js";
import { MeshScope } from "./mesh-scope.js";
import { exportTolerance } from "./precision.js";
import type { PreviewFeedback } from "./preview-feedback.js";
import { threadDomain } from "./thread-domain.js";
import { nextThreadResolution } from "./thread-preview.js";
import { threadPreviewSurface } from "./thread-preview-surface.js";
import type { ThreadPreviewResolution } from "./thread-sampling.js";
import type { DecoratorInstance } from "./types.js";

export async function initializeMeshRuntime(wasmUrl?: string): Promise<ManifoldToplevel> {
  const { default: Module } = await import("manifold-3d");
  const runtime = await Module(wasmUrl ? { locateFile: () => wasmUrl } : undefined);
  runtime.setup();
  return runtime;
}

export class PreviewRuntimeRequired extends Error {}

export function decoratedMeshes(
  runtime: ManifoldToplevel,
  document: SketchDocument,
  javascript?: JavaScriptDecorators,
): ExportMesh[] {
  return (document.bodies ?? []).map((body) => {
    const instances = (document.decorators ?? []).filter((d) =>
      d.faces.some((f) => f.body === body.id),
    );
    if (!instances.length) return exportMesh(body);
    const scope = new MeshScope(runtime, body.center, exportTolerance(instances, document) / 4);
    try {
      return scope.mesh(decoratedBody(scope, document, body, instances, javascript));
    } catch (error) {
      throw new Error(
        `Decorated body ${body.id}, ${instances.map((d) => `${d.definition} (${d.id})`).join(", ")}: ${error instanceof Error ? error.message : error}`,
      );
    } finally {
      scope.close();
    }
  });
}

export function decoratorPreview(
  runtime: ManifoldToplevel | undefined,
  document: DisplayDocument,
  instance: DecoratorInstance,
): ExportMesh {
  if (instance.definition === knurlDefinition) {
    const mesh = knurlPreview(runtime, document, instance);
    if (!mesh) throw new PreviewRuntimeRequired();
    return mesh;
  }
  return renderThreadPreview(runtime, document, instance).mesh;
}

export function decoratorLivePreview(
  runtime: ManifoldToplevel | undefined,
  document: DisplayDocument,
  instance: DecoratorInstance,
  feedback: PreviewFeedback,
): { mesh: ExportMesh; state: ThreadPreviewResolution | null } {
  if (instance.definition === knurlDefinition)
    return { mesh: decoratorPreview(runtime, document, instance), state: null };
  return renderThreadPreview(runtime, document, instance, nextThreadResolution(feedback));
}

function renderThreadPreview(
  runtime: ManifoldToplevel | undefined,
  document: DisplayDocument,
  instance: DecoratorInstance,
  resolution?: ThreadPreviewResolution,
): { mesh: ExportMesh; state: ThreadPreviewResolution | null } {
  const prepared = prepareThreadGeometry(document, instance, "preview", resolution);
  if (!prepared) return { mesh: { vertices: [], triangles: [] }, state: null };
  const { body, faces, geometry } = prepared;
  // Clip partial domains as closed volumes, then display their threaded surfaces.
  const surface = (mesh: ExportMesh) =>
    threadPreviewSurface(mesh, instance.frame, faces, body.faces);
  if (!geometry.masks) return { mesh: surface(geometry.fill), state: geometry.resolution };
  if (!runtime) throw new PreviewRuntimeRequired();
  const scope = new MeshScope(runtime, body.center);
  try {
    const mask = threadDomain(scope, body, faces, geometry);
    const generated = scope.from(geometry.fill);
    return {
      mesh: surface(scope.mesh(scope.keep(generated.intersect(mask)))),
      state: geometry.resolution,
    };
  } finally {
    scope.close();
  }
}
