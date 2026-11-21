import { matrixAffine } from "../model/affine.js";
import type { BodyTransform } from "../model/body.js";
import { placementMatrix } from "../model/body-placement.js";
import { transformSmartObjects } from "../model/smart-object.js";
import { newId, type SketchDocument } from "../sketch/document.js";
import { continuingBodies, materialize } from "./kernel-result.js";
import type { SolidCalculator } from "./solid-calculator.js";

/** Transform links and exact bodies in the same candidate before publication. */
export async function rigidPlacement(
  document: SketchDocument,
  edit: BodyTransform,
  kernel: SolidCalculator,
): Promise<SketchDocument> {
  const { smartObjectIds, ...bodyEdit } = edit;
  let candidate = document;
  if (smartObjectIds?.length) {
    if (Math.hypot(...edit.axis) < 1e-12 || !Number.isFinite(Math.hypot(...edit.axis)))
      throw new Error("Choose a valid rotation axis");
    candidate = transformSmartObjects(
      candidate,
      {
        ids: smartObjectIds,
        transform: matrixAffine(placementMatrix(edit)),
        duplicate: edit.duplicate,
      },
      newId,
    );
    if (!edit.ids.length) return candidate;
  }
  const bodies = document.bodies ?? [];
  const result = await kernel.calculate({ ...bodyEdit, kind: "transform", bodies });
  const transformed = materialize(bodies, result);
  return {
    ...candidate,
    bodies: edit.duplicate ? transformed : continuingBodies(bodies, transformed),
  };
}
