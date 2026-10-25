import type { BodyGeometry } from "../model/body.js";
import type { DisplayDocument } from "../model/display-document.js";
import { isBuiltinDecorator } from "./builtins.js";
import { type DecoratorDisplayMode, effectiveDecoratorDisplay } from "./display-mode.js";

/** View/queue-local serialization of immutable support inputs; no document authority. */
export class PreviewSignatureCache {
  private supports = new WeakMap<BodyGeometry, string>();
  private documents = new WeakMap<DisplayDocument, string>();
  support(body: BodyGeometry | undefined): string {
    if (!body) return "null";
    let key = this.supports.get(body);
    if (key === undefined) {
      key = JSON.stringify({ center: body.center, faces: body.faces });
      this.supports.set(body, key);
    }
    return key;
  }
  custom(document: DisplayDocument, sourcesKey: string): string {
    let key = this.documents.get(document);
    if (key === undefined) {
      key = JSON.stringify(document);
      this.documents.set(document, key);
    }
    return `[${key},${JSON.stringify(sourcesKey)}]`;
  }
}

/** Include the support body: trimmed threads can depend on adjacent faces. */
export function previewSignatures(
  document: DisplayDocument,
  sourcesKey: string,
  cache = new PreviewSignatureCache(),
): Map<string, string> {
  const result = new Map<string, string>();
  let customDocumentKey: string | undefined;
  for (const instance of document.decorators ?? []) {
    if (instance.problem) continue;
    if (!isBuiltinDecorator(instance.definition)) {
      customDocumentKey ??= cache.custom(document, sourcesKey);
      result.set(instance.id, customDocumentKey);
      continue;
    }
    const bodies = [...new Set(instance.faces.map((face) => face.body))].map((id) => {
      const body = document.bodies?.find((candidate) => candidate.id === id);
      return cache.support(body);
    });
    const parameters = JSON.stringify([
      instance.definition,
      instance.version,
      instance.faces,
      instance.settings,
      instance.frame,
      instance.axialReference,
    ]);
    // Fragments come only from JSON.stringify; preserve the existing signature bytes
    // while avoiding another serialization of large face arrays for every instance.
    result.set(instance.id, `${parameters.slice(0, -1)},[${bodies.join(",")}]]`);
  }
  return result;
}

export function previewFingerprint(signatures: ReadonlyMap<string, string>, live: boolean): string {
  return JSON.stringify([live, [...signatures].sort(([a], [b]) => a.localeCompare(b))]);
}

/** Include resolved appearance so delayed work cannot revive a previous display mode. */
export function previewDisplaySignatures(
  document: DisplayDocument,
  sourcesKey: string,
  defaultMode: DecoratorDisplayMode,
  cache = new PreviewSignatureCache(),
): Map<string, string> {
  const signatures = previewSignatures(document, sourcesKey, cache);
  for (const instance of document.decorators ?? []) {
    const signature = signatures.get(instance.id);
    if (signature !== undefined)
      signatures.set(
        instance.id,
        `${signature}/${effectiveDecoratorDisplay(instance, defaultMode)}`,
      );
  }
  return signatures;
}
