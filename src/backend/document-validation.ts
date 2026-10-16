import { validateDefinitions } from "../decorators/definition-edits.js";
import { validateDecorators } from "../decorators/edits.js";
import { validateBodyAppearances } from "../model/body-appearance.js";
import type { SketchDocument } from "../sketch/document.js";
import { validateSketchGrid } from "../sketch/grid-settings.js";
import { validateFrame } from "../sketch/planes.js";
import { validateSketch } from "../sketch/sketch-validation.js";
import { validateTags } from "../tags/model.js";

export function validateDocument(document: SketchDocument): void {
  if (
    document.units !== "mm" ||
    !Array.isArray(document.sketches) ||
    (document.bodies !== undefined && !Array.isArray(document.bodies)) ||
    (document.constructionPlanes !== undefined && !Array.isArray(document.constructionPlanes))
  )
    throw new Error("Invalid Makeshift document");
  if (document.sketchGrid !== undefined) validateSketchGrid(document.sketchGrid);
  validateBodyAppearances(document);
  validateTags(document);
  validateDecorators(document);
  validateDefinitions(document);
  if (document.entityPresentation !== undefined) {
    if (!Array.isArray(document.entityPresentation)) throw new Error("Invalid entity presentation");
    const seen = new Set<string>();
    for (const entry of document.entityPresentation) {
      if (
        !entry ||
        typeof entry.id !== "string" ||
        seen.has(entry.id) ||
        typeof entry.name !== "string" ||
        !entry.name.trim() ||
        entry.name.length > 200
      )
        throw new Error("Invalid entity presentation");
      seen.add(entry.id);
    }
  }
  const ids = new Set<string>();
  const identify = (id: string) => {
    if (typeof id !== "string" || !id || ids.has(id))
      throw new Error("Invalid or duplicate document identity");
    ids.add(id);
  };
  for (const sketch of document.sketches) {
    identify(sketch.id);
    validateSketch(sketch);
    // Curve and constraint references are scoped to their sketch.
  }
  for (const plane of document.constructionPlanes ?? []) {
    identify(plane.id);
    validateFrame(plane.frame);
  }
  for (const group of document.taggedGroups ?? []) identify(group.id);
  for (const instance of document.decorators ?? []) identify(instance.id);
  for (const body of document.bodies ?? []) {
    identify(body.id);
    for (const face of body.faces) identify(face.id);
    for (const edge of body.edges) identify(edge.id);
  }
}
