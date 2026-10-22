import { editDefinitions } from "../decorators/definition-edits.js";
import { editDecorators } from "../decorators/edits.js";
import { editGuides } from "../guides/model.js";
import { copySketchGuides } from "../guides/sketch-continuation.js";
import { editBodyAppearance } from "../model/body-appearance.js";
import { withConstructionPlane } from "../model/construction-plane.js";
import { editEntityPresentation } from "../model/entity-presentation.js";
import { copySketch } from "../sketch/copy-selection.js";
import { type SketchDocument, withSketch } from "../sketch/document.js";
import { removeCurves } from "../sketch/geometry.js";
import type { ModelRequest } from "../sketch/model-api.js";
import { mergeDocumentSketches } from "../sketch/sketch-merge.js";
import { editTags } from "../tags/model.js";
import { deleteEntities } from "./delete-entities.js";

export function isDirectDocumentEdit(
  request: ModelRequest,
): request is Exclude<Parameters<typeof editDocument>[1], { kind: "delete-entities" }> {
  return [
    "guide-point",
    "tagged-group",
    "decorator",
    "decorator-definition",
    "body-appearance",
    "rename-entity",
    "reorder-entity",
    "construction-plane",
    "delete-plane",
    "place-sketch",
    "merge-sketches",
    "delete-sketch",
    "remove",
    "clear",
  ].includes(request.kind);
}

export function editDocument(
  document: SketchDocument,
  request: Extract<
    ModelRequest,
    {
      kind:
        | "guide-point"
        | "tagged-group"
        | "decorator"
        | "decorator-definition"
        | "body-appearance"
        | "rename-entity"
        | "reorder-entity"
        | "construction-plane"
        | "delete-plane"
        | "place-sketch"
        | "merge-sketches"
        | "delete-entities"
        | "delete-sketch"
        | "remove"
        | "clear";
    }
  >,
): SketchDocument {
  switch (request.kind) {
    case "guide-point":
      return editGuides(document, request.edit);
    case "tagged-group":
      return editTags(document, request.edit);
    case "decorator":
      return editDecorators(document, request.edit);
    case "decorator-definition":
      return editDefinitions(document, request.edit);
    case "body-appearance":
      return editBodyAppearance(document, request.appearance);
    case "rename-entity":
    case "reorder-entity":
      return editEntityPresentation(document, request);
    case "construction-plane":
      return withConstructionPlane(document, request.plane);
    case "delete-plane":
      return {
        ...document,
        constructionPlanes: (document.constructionPlanes ?? []).filter((p) => p.id !== request.id),
      };
    case "place-sketch": {
      const placements = [
        { sketchId: request.sketchId, frame: request.frame },
        ...(request.additional ?? []),
      ];
      if (new Set(placements.map((p) => p.sketchId)).size !== placements.length)
        throw new Error("Select each sketch once");
      let next = document;
      for (const placement of placements) {
        const sketch = document.sketches.find((s) => s.id === placement.sketchId);
        if (!sketch) throw new Error("Sketch no longer exists");
        const ids = new Map<string, string>();
        const placed = request.duplicate ? copySketch(sketch, ids) : sketch;
        next = withSketch(next, {
          ...placed,
          plane: placement.frame,
        });
        if (request.duplicate) next = copySketchGuides(next, sketch.id, placed.id, ids);
      }
      return next;
    }
    case "merge-sketches": {
      return mergeDocumentSketches(document, request.targetSketchId, request.sourceSketchIds);
    }
    case "delete-entities":
      return deleteEntities(document, request);
    case "delete-sketch":
      return {
        ...document,
        sketches: document.sketches.filter((s) => s.id !== request.sketchId),
      };
    case "remove":
    case "clear": {
      const sketch = document.sketches.find((item) => item.id === request.sketchId);
      if (!sketch) throw new Error("Sketch no longer exists");
      const ids =
        request.kind === "clear" ? sketch.curves.map((curve) => curve.id) : (request.ids ?? []);
      return withSketch(document, removeCurves(sketch, new Set(ids)));
    }
  }
}
