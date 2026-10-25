import type { BodyGeometry } from "../model/body.js";
import { topologyOrigins } from "../model/body-correspondence.js";
import type { DisplayDocument } from "../model/display-document.js";
import type { GeometryDependency } from "./definition.js";
import { gearDefinition, gearManifest } from "./gear-settings.js";
import type { DecoratorInstance } from "./types.js";

/** Copies, splits and merges need correspondence even when original supports survive. */
export function hasDecoratorDescendants(
  source: DisplayDocument,
  candidate: DisplayDocument,
  instance: DecoratorInstance,
): boolean {
  const bodyIds = new Set(instance.faces.map((face) => face.body));
  const faceIds = new Set(instance.faces.map((face) => face.face));
  return (candidate.bodies ?? []).some((body) => {
    if (source.bodies?.some((old) => old === body)) return false;
    const origins = topologyOrigins.get(body);
    if (!origins?.bodies.some((id) => bodyIds.has(id))) return false;
    if (origins.copy || !bodyIds.has(body.id)) return true;
    return [...origins.faces].some(
      ([id, parents]) =>
        parents.some((parent) => faceIds.has(parent)) &&
        (!faceIds.has(id) || parents.some((parent) => !faceIds.has(parent))),
    );
  });
}

export function decoratorDefinition(document: DisplayDocument, instance: DecoratorInstance) {
  return instance.definition === gearDefinition && instance.version === 1
    ? gearManifest
    : document.decoratorDefinitions?.find(
        (d) => d.id === instance.definition && d.version === instance.version,
      );
}

/** Derive dependencies from current topology, including newly adjacent faces. */
export function geometryDependency(
  body: BodyGeometry | undefined,
  faceIds: readonly string[],
  scope: GeometryDependency,
): unknown {
  if (!body) return null;
  if (scope === "bodies") {
    const { id, volume, center, bounds, faces, edges } = body;
    return { id, volume, center, bounds, faces, edges };
  }
  const selected = body.faces.filter((face) => faceIds.includes(face.id));
  if (scope === "faces") return selected;
  const edges = new Set(selected.flatMap((face) => face.edges));
  return body.faces.filter(
    (face) => faceIds.includes(face.id) || face.edges.some((edge) => edges.has(edge)),
  );
}

/** Immutable body identity is the cheap path; equal geometry survives rematerialization. */
export function unchangedDecoratorGeometry(
  source: DisplayDocument,
  candidate: DisplayDocument,
  instance: DecoratorInstance,
  scope: GeometryDependency,
): boolean {
  return [...new Set(instance.faces.map((face) => face.body))].every((id) => {
    const before = source.bodies?.find((body) => body.id === id);
    const after = candidate.bodies?.find((body) => body.id === id);
    if (before === after) return true;
    const faces = instance.faces.filter((face) => face.body === id).map((face) => face.face);
    return (
      JSON.stringify(geometryDependency(before, faces, scope)) ===
      JSON.stringify(geometryDependency(after, faces, scope))
    );
  });
}
