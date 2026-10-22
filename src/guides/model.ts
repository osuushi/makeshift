import type { DisplayDocument } from "../model/display-document.js";
import { newId, type SketchDocument } from "../sketch/document.js";
import { guidePosition } from "./evaluate.js";
import { type GuideAnchor, type GuideEdit, guideKey } from "./types.js";

/** Structural validation also runs before archived BReps have display geometry. */
export function validateGuideAnchor(document: DisplayDocument, a: GuideAnchor): void {
  if (!a || typeof a !== "object") throw new Error("Invalid guide anchor");
  const features = ["start", "end", "midpoint", "circle-center"];
  if (a.kind === "sketch-curve") {
    if (
      !features.includes(a.feature) ||
      !document.sketches.some((s) => s.id === a.sketch && s.curves.some((c) => c.id === a.curve))
    )
      throw new Error("Guide needs a current sketch curve");
    return;
  }
  const body = document.bodies?.find((b) => b.id === a.body);
  if (!body) throw new Error("Guide needs a current body");
  if (a.kind === "body-center" && a.feature === "bounds-center") return;
  if (
    a.kind === "body-edge" &&
    features.includes(a.feature) &&
    body.edges.some((e) => e.id === a.edge)
  )
    return;
  const references =
    a.kind === "body-junction" ? a.edges : a.kind === "body-faces" ? a.faces : null;
  const pool = a.kind === "body-junction" ? body.edges : body.faces;
  if (
    !Array.isArray(references) ||
    !references.length ||
    new Set(references).size !== references.length ||
    references.some((id) => !pool.some((p) => p.id === id))
  )
    throw new Error("Guide needs current topology references");
  if (a.kind === "body-junction" && references.length >= 2) return;
  if (
    a.kind === "body-faces" &&
    ["area-center", "bounds-center", "circle-center"].includes(a.feature)
  )
    return;
  throw new Error("Invalid guide definition");
}
export function validateGuides(document: SketchDocument): void {
  if (document.guidePoints === undefined) return;
  if (!Array.isArray(document.guidePoints)) throw new Error("Invalid guide points");
  for (const point of document.guidePoints) {
    if (
      !point ||
      typeof point.name !== "string" ||
      !point.name.trim() ||
      point.name.length > 200 ||
      typeof point.hidden !== "boolean"
    )
      throw new Error("Invalid guide point");
    validateGuideAnchor(document, point.anchor);
  }
}
export function editGuides(document: SketchDocument, edit: GuideEdit): SketchDocument {
  const points = document.guidePoints ?? [];
  if (edit.action === "create") {
    validateGuideAnchor(document, edit.anchor);
    const point = guidePosition(document, edit.anchor);
    if (!point?.every(Number.isFinite)) throw new Error("That point of interest no longer exists");
    if (points.some((p) => guideKey(p.anchor) === guideKey(edit.anchor))) return document;
    const used = new Set(points.map((p) => p.name));
    let number = 1;
    while (used.has(`Guide point ${number}`)) number++;
    const candidate = {
      ...document,
      guidePoints: [
        ...points,
        {
          id: newId(),
          name: edit.name ?? `Guide point ${number}`,
          hidden: false,
          anchor: structuredClone(edit.anchor),
        },
      ],
    };
    validateGuides(candidate);
    return candidate;
  }
  if (edit.action === "remove-many") {
    if (
      !Array.isArray(edit.ids) ||
      !edit.ids.length ||
      edit.ids.some((id) => !points.some((p) => p.id === id))
    )
      throw new Error("Select existing guide points to delete");
    return { ...document, guidePoints: points.filter((p) => !edit.ids.includes(p.id)) };
  }
  if (!points.some((p) => p.id === edit.id)) throw new Error("Guide point no longer exists");
  if (edit.action === "remove")
    return { ...document, guidePoints: points.filter((p) => p.id !== edit.id) };
  if (edit.action !== "update") throw new Error("Invalid guide edit");
  const candidate = {
    ...document,
    guidePoints: points.map((p) =>
      p.id !== edit.id
        ? p
        : {
            ...p,
            ...(edit.name !== undefined ? { name: edit.name } : {}),
            ...(edit.hidden !== undefined ? { hidden: edit.hidden } : {}),
          },
    ),
  };
  validateGuides(candidate);
  return candidate;
}
/** Deletion/curve kind changes prune anchors in the same geometry edit, including scripts. */
export function pruneGuides<T extends DisplayDocument>(document: T): T {
  if (!document.guidePoints?.length) return document;
  const points = document.guidePoints.filter((p) =>
    guidePosition(document, p.anchor)?.every(Number.isFinite),
  );
  return points.length === document.guidePoints.length
    ? document
    : { ...document, guidePoints: points };
}
