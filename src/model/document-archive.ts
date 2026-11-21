import { normalizeThreadPreset, threadDefinition } from "../decorators/thread-settings.js";
import type { Seals } from "../security/signatures.js";
import type { SketchDocument } from "../sketch/document.js";
import { type Drawing, defaultBench, singleBench, validateBenchLayout } from "./benches.js";
import { type CameraState, validateCameraState } from "./camera-state.js";
import { exactBodies } from "./exact-body.js";

const exactDocument = (document: SketchDocument) => ({
  ...document,
  bodies: document.bodies && exactBodies(document.bodies),
});

export function documentArchive(document: SketchDocument, camera?: CameraState): string {
  return JSON.stringify({
    format: "makeshift",
    version: 1,
    ...(camera ? { camera: validateCameraState(camera) } : {}),
    document: exactDocument(document),
  });
}

export function drawingArchive(drawing: Drawing, camera?: CameraState): string {
  const [first] = drawing.benches;
  if (
    drawing.benches.length === 1 &&
    first.id === defaultBench.id &&
    first.name === defaultBench.name
  )
    return documentArchive(first.document, camera);
  return JSON.stringify({
    format: "makeshift",
    version: drawing.benches.some(({ document }) => document.smartObjects?.length) ? 5 : 4,
    activeBench: drawing.activeBench,
    camera: validateCameraState(camera),
    benches: drawing.benches.map((bench) => ({
      ...bench,
      document: exactDocument(bench.document),
    })),
  });
}

export function readArchive(data: string): SketchDocument {
  return readFileArchive(data).document;
}

export interface FileArchive {
  document: SketchDocument;
  drawing?: Drawing;
  camera?: CameraState;
  seals?: Seals;
}

export function archivedDrawing(archive: FileArchive): Drawing {
  return archive.drawing ?? singleBench(archive.document);
}

export function readFileArchive(data: string, zipped = false): FileArchive {
  if (data.startsWith("FREACP1C"))
    throw new Error(
      "This file was saved by the older Freac prototype. This version cannot open that format yet. The file has not been changed.",
    );
  const archive = JSON.parse(data);
  if (
    !["makeshift", "freac"].includes(archive?.format) ||
    !(zipped ? [2, 3, 4, 5] : [1, 3, 4, 5]).includes(archive.version)
  )
    throw new Error("Unsupported Makeshift file format");
  const camera = validateCameraState(archive.camera);
  const options = {
    ...(archive.seals !== undefined ? { seals: archive.seals } : {}),
    ...(camera ? { camera } : {}),
  };
  if (archive.version === 4 || archive.version === 5) {
    const drawing: Drawing = { benches: archive.benches, activeBench: archive.activeBench };
    validateBenchLayout(drawing);
    const benches = drawing.benches.map(({ id, name, document }) => ({
      id,
      name,
      document: migrateThreadPresets(document),
    }));
    const active = benches.find((bench) => bench.id === drawing.activeBench);
    if (!active) throw new Error("The active drawing bench is missing");
    return { ...options, document: active.document, drawing: { ...drawing, benches } };
  }
  if (!archive.document || archive.benches !== undefined)
    throw new Error("Unsupported Makeshift file format");
  return { ...options, document: migrateThreadPresets(archive.document) };
}

function migrateThreadPresets(original: SketchDocument): SketchDocument {
  return Array.isArray(original.decorators)
    ? {
        ...original,
        decorators: original.decorators.map((instance) =>
          instance?.definition === threadDefinition && instance.settings
            ? { ...instance, settings: normalizeThreadPreset(instance.settings) }
            : instance,
        ),
      }
    : original;
}
