import { continueScaledGuides } from "../guides/sketch-continuation.js";
import { identityScale, type ScaleOperation, validateScale } from "../model/scale.js";
import { type Curve, type SketchDocument, withSketch } from "../sketch/document.js";
import { continueBodyMetadata } from "./body-metadata.js";
import { continuingBodies, materialize } from "./kernel-result.js";
import { scaleSketch } from "./scale-sketch.js";
import type { SolidCalculator } from "./solid-calculator.js";

export async function scaleDocument(
  document: SketchDocument,
  operation: ScaleOperation,
  kernel: SolidCalculator,
): Promise<SketchDocument> {
  validateScale(operation);
  if (operation.kind === "curves" || operation.kind === "sketches") {
    return scaledSketches(document, operation);
  }
  if (operation.kind !== "solids") throw new Error("Unknown scale selection");
  const bodies = document.bodies ?? [];
  const componentIds = [...operation.faces, ...operation.edges].map((t) => t.body);
  const ids = [...operation.ids, ...componentIds];
  if (
    !ids.length ||
    operation.ids.some((id) => componentIds.includes(id)) ||
    ids.some((id) => !bodies.some((b) => b.id === id))
  )
    throw new Error("Select existing disjoint bodies, faces or edges to scale");
  if (operation.faces.length && operation.edges.length)
    throw new Error("Scale faces or edges separately");
  if (new Set(operation.ids).size !== operation.ids.length)
    throw new Error("Select each body once");
  for (const [kind, targets] of [
    ["faces", operation.faces],
    ["edges", operation.edges],
  ] as const) {
    const keys = new Set<string>();
    for (const target of targets) {
      const id = "face" in target ? target.face : target.edge;
      const key = `${target.body}/${id}`;
      if (
        keys.has(key) ||
        !bodies.find((b) => b.id === target.body)?.[kind].some((entity) => entity.id === id)
      )
        throw new Error("Select each existing scale boundary once");
      keys.add(key);
    }
  }
  if (identityScale(operation)) return document;
  let next = bodies;
  const apply = (result: Parameters<typeof materialize>[1]) => {
    next = continuingBodies(next, materialize(next, result));
  };
  if (operation.ids.length)
    apply(
      await kernel.calculate({
        kind: "scale",
        ids: operation.ids,
        pivot: operation.pivot,
        factor: operation.factor,
        factors: operation.factors,
        bodies,
      }),
    );
  for (const id of new Set(componentIds)) {
    apply(
      await kernel.calculate({
        kind: "scale-boundaries",
        faces: operation.faces.filter((t) => t.body === id),
        edges: operation.edges.filter((t) => t.body === id),
        pivot: operation.pivot,
        factor: operation.factor,
        factors: operation.factors,
        bodies,
      }),
    );
  }
  return continueBodyMetadata(
    document,
    { ...document, bodies: next },
    { kind: "scale", operation },
  );
}

function scaledSketches(
  document: SketchDocument,
  operation: Extract<ScaleOperation, { kind: "curves" | "sketches" }>,
): SketchDocument {
  const ids = operation.kind === "curves" ? [operation.sketchId] : operation.ids;
  if (
    !ids.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !document.sketches.some((s) => s.id === id))
  )
    throw new Error("Select existing sketches to scale");
  let next = document;
  for (const sketch of document.sketches.filter((s) => ids.includes(s.id))) {
    const replacements = new Map<string, Curve[]>();
    next = withSketch(next, scaleSketch(sketch, operation, replacements));
    next = continueScaledGuides(next, sketch.id, replacements);
  }
  return identityScale(operation) ? document : next;
}
