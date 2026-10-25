import type { BodyGeometry } from "../model/body.js";
import type { DisplayDocument } from "../model/display-document.js";
import { isBuiltinDecorator } from "./builtins.js";
import type { GeometryDependency } from "./definition.js";
import { decoratorDefinition, geometryDependency } from "./dependencies.js";
import { gearDefinition } from "./gear-settings.js";
import type { DecoratorInstance } from "./types.js";

/** View/queue-local serialization of immutable support inputs; no document authority. */
export class PreviewSignatureCache {
  private supports = new WeakMap<BodyGeometry, string>();
  private documents = new WeakMap<DisplayDocument, string>();
  private geometry = new WeakMap<BodyGeometry, Map<string, string>>();
  scoped(body: BodyGeometry | undefined, faces: string[], scope: GeometryDependency): string {
    if (!body) return "null";
    let entries = this.geometry.get(body);
    if (!entries) {
      entries = new Map();
      this.geometry.set(body, entries);
    }
    const key = JSON.stringify([scope, faces]);
    let value = entries.get(key);
    if (value === undefined) {
      value = JSON.stringify(geometryDependency(body, faces, scope));
      entries.set(key, value);
    }
    return value;
  }
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
    const definition = decoratorDefinition(document, instance);
    const scope = definition?.dependencies?.preview;
    if (scope) {
      const bodies = [...new Set(instance.faces.map((face) => face.body))].map((id) =>
        cache.scoped(
          document.bodies?.find((body) => body.id === id),
          instance.faces.filter((face) => face.body === id).map((face) => face.face),
          scope,
        ),
      );
      result.set(
        instance.id,
        JSON.stringify([
          definition,
          instance.definition === gearDefinition ? null : sourcesKey,
          instance.definition === gearDefinition ? previewParameters(instance) : instance,
          bodies,
        ]),
      );
      continue;
    }
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

/** Effective mesh inputs, excluding preset names and group bookkeeping. */
function previewParameters(instance: DecoratorInstance) {
  return [
    instance.definition,
    instance.version,
    instance.faces,
    instance.settings,
    instance.frame,
    instance.axialReference,
    instance.state,
    instance.gearPitchRadius,
  ];
}

export function previewFingerprint(signatures: ReadonlyMap<string, string>, live: boolean): string {
  return JSON.stringify([live, [...signatures].sort(([a], [b]) => a.localeCompare(b))]);
}
