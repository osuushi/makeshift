import type { LinkedBench } from "../model/smart-object.js";
import type { SketchDocument } from "../sketch/document.js";
import type { ModelView } from "../sketch/model-api.js";
import type { DrawingBenches } from "./drawing-benches.js";

const displays = new WeakMap<SketchDocument, LinkedBench>();
function displayOf(document: SketchDocument): LinkedBench {
  let display = displays.get(document);
  if (!display) {
    display = {
      sketches: document.sketches,
      bodies: document.bodies?.map(({ brep: _brep, ...body }) => body),
      bodyAppearances: document.bodyAppearances,
      smartObjects: document.smartObjects,
    };
    displays.set(document, display);
  }
  return display;
}

export function linkedView(
  benches: DrawingBenches,
): Pick<ModelView, "editingBench" | "inline" | "linkedBenches"> {
  return {
    editingBench: benches.editing,
    ...(benches.inline.length ? { inline: benches.inline } : {}),
    ...(benches.inline.length || benches.store.data.smartObjects?.length
      ? {
          linkedBenches: benches
            .relatedDocuments()
            .map(({ id, document }) => ({ id, display: displayOf(document) })),
        }
      : {}),
  };
}
