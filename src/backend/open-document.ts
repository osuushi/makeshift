import { knurlDefinition } from "../decorators/builtins.js";
import type { Body } from "../model/body.js";
import type { SketchDocument } from "../sketch/document.js";
import { continueBodyMetadata } from "./body-metadata.js";
import { validateDocument } from "./document-validation.js";
import { materialize } from "./kernel-result.js";
import type { SolidCalculator } from "./solid-calculator.js";

/** Inspect only changes geometry when simplification changes topology. Archives
 * omit display derivatives: hydrate surviving identities before continuing the
 * repaired bodies' metadata, and preserve unchanged bodies by reference. */
function inspectedMetadataSource(source: SketchDocument, bodies: Body[]): SketchDocument {
  const current = new Map(bodies.map((body) => [body.id, body]));
  let repaired = false;
  const previous = source.bodies?.map((before) => {
    const after = current.get(before.id);
    if (!after) return before;
    const faces = new Map(after.faces.map((face) => [face.id, face]));
    const edges = new Map(after.edges.map((edge) => [edge.id, edge]));
    if (
      before.faces.length === faces.size &&
      before.edges.length === edges.size &&
      before.faces.every((face) => faces.has(face.id)) &&
      before.edges.every((edge) => edges.has(edge.id))
    )
      return after;
    repaired = true;
    return {
      ...after,
      ...before,
      faces: before.faces.map((face) => ({ ...faces.get(face.id), ...face })),
      edges: before.edges.map((edge) => ({ ...edges.get(edge.id), ...edge })),
    };
  });
  return { ...source, bodies: repaired ? previous : bodies };
}

export async function openDocument(
  source: SketchDocument,
  kernel: SolidCalculator,
): Promise<SketchDocument> {
  const decorators = Array.isArray(source.decorators)
    ? source.decorators.map((instance) => {
        if (instance?.definition !== knurlDefinition || !instance.settings) return instance;
        const previous = instance.settings.preset;
        const preset =
          previous === "fdm-fine"
            ? "fine"
            : previous === "fdm-coarse"
              ? "coarse"
              : previous === "resin"
                ? "custom"
                : previous;
        return preset === previous
          ? instance
          : { ...instance, settings: { ...instance.settings, preset } };
      })
    : source.decorators;
  const migrated = { ...source, decorators };
  validateDocument(migrated);
  const result = await kernel.calculate({ kind: "inspect", bodies: migrated.bodies ?? [] });
  const bodies = materialize([], result);
  const document = continueBodyMetadata(inspectedMetadataSource(migrated, bodies), {
    ...migrated,
    bodies,
  });
  validateDocument(document);
  return document;
}
