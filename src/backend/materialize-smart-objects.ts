import { appendClipboard, cloneClipboard } from "../clipboard/geometry.js";
import { type Affine, affineFrame, identityAffine, requireAffine } from "../model/affine.js";
import { exactBodies } from "../model/exact-body.js";
import { resolvePlacements, type SmartObject } from "../model/smart-object.js";
import { newId, type SketchDocument } from "../sketch/document.js";
import { continueBodyMetadata } from "./body-metadata.js";
import { continuingBodies, materialize } from "./kernel-result.js";
import { materializeSmartSketch } from "./materialize-smart-sketch.js";
import { openDocument } from "./open-document.js";
import type { SolidCalculator } from "./solid-calculator.js";

export async function materializeSmartObjects(
  destination: SketchDocument,
  objects: readonly SmartObject[],
  lookup: (id: string) => SketchDocument,
  kernel: SolidCalculator,
  checkCancellation: () => void,
): Promise<SketchDocument> {
  let next = destination;
  for (const placement of resolvePlacements(objects, lookup)) {
    checkCancellation();
    const source = lookup(placement.source);
    const copy = await materializeBench(source, placement.transform, kernel);
    next = appendClipboard(next, copy);
    if (copy.constructionPlanes?.length)
      next = {
        ...next,
        constructionPlanes: [...(next.constructionPlanes ?? []), ...copy.constructionPlanes],
      };
  }
  return next;
}

async function materializeBench(
  source: SketchDocument,
  matrix: Affine,
  kernel: SolidCalculator,
): Promise<SketchDocument> {
  requireAffine(matrix);
  const unchanged = matrix.every((value, i) => value === identityAffine[i]);
  const bodies = await placeBodies(source, matrix, kernel);
  const transformed = continueBodyMetadata(source, { ...source, bodies });
  const names = new Map((source.entityPresentation ?? []).map(({ id, name }) => [id, name]));
  const constructionPlanes = (source.constructionPlanes ?? []).map(({ id, frame }) => ({
    id: newId(),
    frame: unchanged ? frame : affineFrame(frame, matrix).plane,
    name: names.get(id),
  }));
  const geometryIds = new Set([...source.sketches, ...bodies].map(({ id }) => id));
  const copy = cloneClipboard({
    sketches: unchanged
      ? source.sketches
      : source.sketches.map((sketch) => materializeSmartSketch(sketch, matrix)),
    bodies: exactBodies(bodies),
    entityPresentation: source.entityPresentation?.filter(({ id }) => geometryIds.has(id)),
    taggedGroups: transformed.taggedGroups,
    bodyAppearances: transformed.bodyAppearances,
    decorators: transformed.decorators,
    decoratorDefinitions: transformed.decoratorDefinitions,
  });
  const snapshot = {
    ...copy,
    units: "mm",
    constructionPlanes: constructionPlanes.map(({ id, frame }) => ({ id, frame })),
    entityPresentation: [
      ...(copy.entityPresentation ?? []),
      ...constructionPlanes.flatMap(({ id, name }) => (name ? [{ id, name }] : [])),
    ],
  } as unknown as SketchDocument;
  return bodies.length ? openDocument(snapshot, kernel) : snapshot;
}

export async function placeBodies(source: SketchDocument, matrix: Affine, kernel: SolidCalculator) {
  const bodies = source.bodies ?? [];
  if (!bodies.length || matrix.every((value, i) => value === identityAffine[i])) return bodies;
  requireAffine(matrix);
  const result = await kernel.calculate({
    kind: "affine",
    matrix,
    ids: bodies.map(({ id }) => id),
    bodies,
  });
  return continuingBodies(bodies, materialize(bodies, result));
}
