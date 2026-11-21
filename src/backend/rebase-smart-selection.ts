import { Vector3 } from "three";
import { affinePoint, translationAffine } from "../model/affine.js";
import type { BodyTransform } from "../model/body.js";
import { benchGeometryBounds, smartObjectBounds } from "../model/smart-object-bounds.js";
import type { SketchDocument } from "../sketch/document.js";
import type { PlaneFrame, Vector } from "../sketch/planes.js";
import { continueBodyMetadata } from "./body-metadata.js";
import { rigidPlacement } from "./rigid-placement.js";
import type { SolidCalculator } from "./solid-calculator.js";

export async function rebaseSmartSelection(
  source: SketchDocument,
  lookup: (id: string) => SketchDocument,
  kernel: SolidCalculator,
): Promise<{ origin: Vector; document: SketchDocument }> {
  const bounds = benchGeometryBounds(source);
  for (const object of source.smartObjects ?? []) bounds.union(smartObjectBounds(object, lookup));
  if (bounds.isEmpty())
    for (const { frame } of source.constructionPlanes ?? [])
      bounds.expandByPoint(new Vector3(...frame.origin));
  const origin = bounds.getCenter(new Vector3()).toArray();
  if (origin.every((value) => value === 0)) return { origin, document: source };

  const translation = origin.map((value) => -value) as Vector;
  const matrix = translationAffine(translation);
  const shift = (frame: PlaneFrame): PlaneFrame => ({
    ...frame,
    origin: affinePoint(matrix, frame.origin),
  });
  const document = {
    ...source,
    sketches: source.sketches.map((sketch) => ({ ...sketch, plane: shift(sketch.plane) })),
    constructionPlanes: source.constructionPlanes?.map((plane) => ({
      ...plane,
      frame: shift(plane.frame),
    })),
  };
  const transform: BodyTransform = {
    ids: (source.bodies ?? []).map(({ id }) => id),
    smartObjectIds: source.smartObjects?.map(({ id }) => id),
    pivot: [0, 0, 0],
    axis: [0, 0, 1],
    angle: 0,
    translation,
    duplicate: false,
  };
  if (!transform.ids.length && !transform.smartObjectIds?.length) return { origin, document };
  const positioned = await rigidPlacement(document, transform, kernel);
  return {
    origin,
    document: continueBodyMetadata(source, positioned, { kind: "transform-bodies", transform }),
  };
}
