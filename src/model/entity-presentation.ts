import { validName } from "../security/text.js";
import type { SketchDocument } from "../sketch/document.js";
import type { DisplayDocument } from "./display-document.js";

export interface EntityPresentation {
  readonly id: string;
  readonly name: string;
}
export function entityRows(document: DisplayDocument, ids: readonly string[], prefix: string) {
  const saved = document.entityPresentation ?? [];
  const rows = ids.map((id, index) => ({
    id,
    name: saved.find((entry) => entry.id === id)?.name ?? `${prefix} ${index + 1}`,
  }));
  return rows.sort((a, b) => {
    const rank = (id: string) => {
      const index = saved.findIndex((entry) => entry.id === id);
      return index < 0 ? saved.length + ids.indexOf(id) : index;
    };
    return rank(a.id) - rank(b.id);
  });
}
export function editEntityPresentation(
  document: SketchDocument,
  request: { id: string; name?: string; beforeId?: string | null },
): SketchDocument {
  const groups = [
    entityRows(
      document,
      (document.bodies ?? []).map((b) => b.id),
      "Body",
    ),
    entityRows(
      document,
      document.sketches.map((s) => s.id),
      "Sketch",
    ),
    entityRows(
      document,
      (document.constructionPlanes ?? []).map((p) => p.id),
      "Plane",
    ),
  ];
  const group = groups.find((rows) => rows.some((row) => row.id === request.id));
  if (!group) throw new Error("Entity no longer exists");
  const index = group.findIndex((row) => row.id === request.id);
  if (request.name !== undefined) {
    if (!validName(request.name)) throw new Error("Use a name of up to 96 printable characters");
    if (group[index].name === request.name.trim()) return document;
    group[index] = { id: request.id, name: request.name.trim() };
  } else {
    if (request.beforeId === request.id) return document;
    if (request.beforeId !== null && !group.some((row) => row.id === request.beforeId))
      throw new Error("Reorder target must belong to the same entity group");
    const reordered = group.filter((row) => row.id !== request.id);
    const next =
      request.beforeId === null
        ? reordered.length
        : reordered.findIndex((row) => row.id === request.beforeId);
    if (next === index) return document;
    reordered.splice(next, 0, group[index]);
    group.splice(0, group.length, ...reordered);
  }
  return { ...document, entityPresentation: groups.flat() };
}
