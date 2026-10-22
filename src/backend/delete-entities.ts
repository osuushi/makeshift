import { continueSketchGuides } from "../guides/sketch-continuation.js";
import { deleteProfiles } from "../sketch/delete-profiles.js";
import { type SketchDocument, withSketch } from "../sketch/document.js";
import type { ModelRequest } from "../sketch/model-api.js";

/** Delete owners and selected region boundaries together with their attached metadata. */
export function deleteEntities(
  document: SketchDocument,
  request: Extract<ModelRequest, { kind: "delete-entities" }>,
): SketchDocument {
  const bodyIds = new Set(request.bodyIds);
  const sketchIds = new Set(request.sketchIds);
  for (const target of request.profiles ?? [])
    if (!document.sketches.some((sketch) => sketch.id === target.sketch))
      throw new Error("Sketch no longer exists");
  let next: SketchDocument = {
    ...document,
    ...(document.bodyAppearances
      ? {
          bodyAppearances: document.bodyAppearances.filter((entry) => !bodyIds.has(entry.body)),
        }
      : {}),
    ...(document.taggedGroups
      ? { taggedGroups: document.taggedGroups.filter((g) => !bodyIds.has(g.body)) }
      : {}),
    ...(bodyIds.size
      ? { bodies: (document.bodies ?? []).filter((body) => !bodyIds.has(body.id)) }
      : {}),
    ...(document.decorators && bodyIds.size
      ? {
          decorators: document.decorators
            .map((instance) => ({
              ...instance,
              faces: instance.faces.filter((face) => !bodyIds.has(face.body)),
            }))
            .filter((instance) => instance.faces.length),
        }
      : {}),
    sketches: document.sketches.filter((sketch) => !sketchIds.has(sketch.id)),
  };
  for (const sketch of next.sketches) {
    const keys = (request.profiles ?? [])
      .filter((target) => target.sketch === sketch.id)
      .map((target) => target.profile);
    if (!keys.length) continue;
    const result = deleteProfiles(sketch, keys);
    next = continueSketchGuides(
      next,
      withSketch(next, result.sketch),
      sketch.id,
      result.curveOrigins,
    );
  }
  return next;
}
