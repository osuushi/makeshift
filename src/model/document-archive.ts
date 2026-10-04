import { normalizeThreadPreset, threadDefinition } from "../decorators/thread-settings.js";
import type { SketchDocument } from "../sketch/document.js";
import { type CameraState, validateCameraState } from "./camera-state.js";
import { exactBodies } from "./exact-body.js";

export function documentArchive(document: SketchDocument, camera?: CameraState): string {
  return JSON.stringify({
    format: "makeshift",
    version: 1,
    ...(camera ? { camera: validateCameraState(camera) } : {}),
    document: {
      ...document,
      bodies: document.bodies && exactBodies(document.bodies),
    },
  });
}

export function readArchive(data: string): SketchDocument {
  return readFileArchive(data).document;
}

export function readFileArchive(data: string): { document: SketchDocument; camera?: CameraState } {
  if (data.startsWith("FREACP1C"))
    throw new Error(
      "This file was saved by the older Freac prototype. This version cannot open that format yet. The file has not been changed.",
    );
  const archive = JSON.parse(data);
  if (
    !["makeshift", "freac"].includes(archive?.format) ||
    archive.version !== 1 ||
    !archive.document
  )
    throw new Error("Unsupported Makeshift file format");
  const camera = validateCameraState(archive.camera);
  const original: SketchDocument = archive.document;
  const document = Array.isArray(original.decorators)
    ? {
        ...original,
        decorators: original.decorators.map((instance) =>
          instance?.definition === threadDefinition && instance.settings
            ? { ...instance, settings: normalizeThreadPreset(instance.settings) }
            : instance,
        ),
      }
    : original;
  return { document, ...(camera ? { camera } : {}) };
}
