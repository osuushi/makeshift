import { newId, type SketchDocument } from "../sketch/document.js";
import { continueGearGroups } from "./gear-support.js";
import type { JavaScriptDecorators } from "./javascript-hooks.js";
import type { DecoratorInstance } from "./types.js";

/** Immediate continuation work, never persisted or reconstructed from historical operations. */
export const pendingCustomContinuation = new WeakSet<DecoratorInstance>();

export function resolveCustomContinuation(
  document: SketchDocument,
  hooks: JavaScriptDecorators,
): SketchDocument {
  let changed = false;
  const decorators = (document.decorators ?? []).flatMap((instance) => {
    if (!pendingCustomContinuation.has(instance)) return [instance];
    changed = true;
    try {
      const groups = hooks.partition(document, instance);
      const results = groups.map((group, index) => ({
        ...instance,
        ...group,
        id: index === 0 ? instance.id : newId(),
      }));
      for (const next of results) {
        if (next.gearGroup) continue;
        const error = hooks.diagnostics(document, next).find((d) => d.severity === "error");
        if (error) throw new Error(error.message);
      }
      return results;
    } catch (error) {
      return [
        {
          ...instance,
          problem: `Decorator continuation needs attention: ${error instanceof Error ? error.message : String(error)}`,
        },
      ];
    }
  });
  return continueGearGroups(changed ? { ...document, decorators } : document);
}
