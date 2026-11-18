import type { SketchDocument } from "../sketch/document.js";
import { safeName, validName } from "./text.js";

/** Older files allowed up to 200 UTF-16 units. Only migrate previously valid text. */
export function migrateNames(doc: SketchDocument): SketchDocument {
  if (!doc || typeof doc !== "object") return doc;
  function names<T extends { name: string }>(items: readonly T[] | undefined) {
    if (!Array.isArray(items)) return items;
    return items.map((v: T) =>
      v && typeof v.name === "string" && v.name.trim() && v.name.length <= 200 && !validName(v.name)
        ? { ...v, name: safeName(v.name, "Unnamed") }
        : v,
    );
  }
  return {
    ...doc,
    ...(doc.entityPresentation ? { entityPresentation: names(doc.entityPresentation) } : {}),
    ...(doc.guidePoints ? { guidePoints: names(doc.guidePoints) } : {}),
    ...(doc.taggedGroups ? { taggedGroups: names(doc.taggedGroups) } : {}),
  };
}
