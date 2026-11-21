import { reflectionAffine } from "../model/affine.js";
import type { MirrorOperation } from "../model/mirror.js";
import { transformSmartObjects } from "../model/smart-object.js";
import { newId, type SketchDocument, withSketch } from "../sketch/document.js";
import { continueBodyMetadata } from "./body-metadata.js";
import { continuingBodies, materialize } from "./kernel-result.js";
import { mirrorSketch } from "./mirror-sketch.js";
import type { SolidCalculator } from "./solid-calculator.js";

export async function mirrorDocument(
  document: SketchDocument,
  operation: MirrorOperation,
  kernel: SolidCalculator,
): Promise<SketchDocument> {
  if (typeof operation.keepOriginal !== "boolean")
    throw new Error("Choose whether to keep the original");
  if (operation.kind === "sketch") {
    const sketch = document.sketches.find((s) => s.id === operation.sketchId);
    if (!sketch) throw new Error("Mirror sketch no longer exists");
    return withSketch(document, mirrorSketch(sketch, operation));
  }
  if (operation.kind !== "bodies") throw new Error("Unknown mirror selection");
  const bodies = document.bodies ?? [];
  const { smartObjectIds, ...bodyOperation } = operation;
  if (
    (!operation.ids.length && !smartObjectIds?.length) ||
    new Set(operation.ids).size !== operation.ids.length ||
    operation.ids.some((id) => !bodies.some((b) => b.id === id))
  )
    throw new Error("Select existing bodies or smart objects to mirror");
  const placed = smartObjectIds?.length
    ? transformSmartObjects(
        document,
        {
          ids: smartObjectIds,
          transform: reflectionAffine(operation.plane.origin, operation.plane.normal),
          duplicate: operation.keepOriginal,
        },
        newId,
      )
    : document;
  if (!operation.ids.length) return placed;
  const byId = new Map(bodies.map((b) => [b.id, b]));
  const operands = operation.ids.map((id) => {
    const body = byId.get(id);
    if (!body) throw new Error("Mirror body no longer exists");
    return body;
  });
  const result = await kernel.calculate({ ...bodyOperation, kind: "mirror", bodies: operands });
  const reflected = materialize(bodies, result);
  return continueBodyMetadata(
    document,
    {
      ...placed,
      bodies: operation.keepOriginal ? reflected : continuingBodies(bodies, reflected),
    },
    { kind: "mirror", operation },
  );
}
