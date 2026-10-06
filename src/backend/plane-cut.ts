import type { PlaneCut } from "../model/plane-cut.js";
import type { SketchDocument } from "../sketch/document.js";
import { validateFrame } from "../sketch/planes.js";
import { continueBodyMetadata } from "./body-metadata.js";
import { continuingBodies, materialize } from "./kernel-result.js";
import type { SolidCalculator } from "./solid-calculator.js";

export async function cutWithPlane(
  document: SketchDocument,
  operation: PlaneCut,
  kernel: SolidCalculator,
): Promise<SketchDocument> {
  validateCutReference(document, operation);
  if (!["split", "imprint"].includes(operation.mode) || !operation.targets.length)
    throw new Error("Select bodies or faces to cut with a surface");
  const bodies = document.bodies ?? [];
  const result = await kernel.calculate({ ...operation, kind: "plane-cut", bodies });
  if (!result.participants.length) return document;
  const next = materialize(bodies, result);
  return continueBodyMetadata(document, {
    ...document,
    bodies: operation.mode === "imprint" ? continuingBodies(bodies, next) : next,
  });
}

/** Applicability is exact and read-only: no candidate, IDs, history or selection are changed. */
export async function planeCutAvailable(
  document: SketchDocument,
  operation: PlaneCut,
  kernel: SolidCalculator,
): Promise<boolean> {
  try {
    validateCutReference(document, operation);
    const result = await kernel.calculate({
      ...operation,
      kind: "plane-cut",
      bodies: document.bodies ?? [],
    });
    return result.participants.length > 0;
  } catch {
    return false;
  }
}

function validateCutReference(document: SketchDocument, operation: PlaneCut): void {
  if (!!operation.frame === !!operation.surface)
    throw new Error("Choose one cutting plane or face");
  if (operation.frame) validateFrame(operation.frame);
  else if (
    !document.bodies?.some(
      (body) =>
        body.id === operation.surface?.body &&
        body.faces.some((face) => face.id === operation.surface?.face),
    )
  )
    throw new Error("Unknown cutting face");
}
