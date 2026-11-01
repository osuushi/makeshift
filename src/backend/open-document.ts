import { knurlDefinition } from "../decorators/builtins.js";
import type { SketchDocument } from "../sketch/document.js";
import { continueBodyMetadata } from "./body-metadata.js";
import { validateDocument } from "./document-validation.js";
import { materialize } from "./kernel-result.js";
import type { SolidCalculator } from "./solid-calculator.js";

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
  const document = continueBodyMetadata(migrated, { ...migrated, bodies: materialize([], result) });
  validateDocument(document);
  return document;
}
