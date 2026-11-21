import { Box3 } from "three";
import type { SmartObject } from "../model/smart-object.js";
import { smartObjectBounds } from "../model/smart-object-bounds.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { ModelView } from "../sketch/model-api.js";

const cache = new WeakMap<SmartObject, { sources: ModelView["linkedBenches"]; box: Box3 }>();

/** A camera or widget repaint can reuse the extents of unchanged placements. */
export function linkedSelectionBounds(editor: SketchEditor, ids: readonly string[]): Box3 {
  const bounds = new Box3();
  const sources = editor.store.linkedBenches;
  if (!sources) return bounds;
  for (const object of editor.store.data.smartObjects ?? []) {
    if (!ids.includes(object.id)) continue;
    let cached = cache.get(object);
    if (!cached || cached.sources !== sources) {
      const lookup = (id: string) => sources.find((source) => source.id === id)?.display;
      cached = { sources, box: smartObjectBounds(object, lookup) };
      cache.set(object, cached);
    }
    bounds.union(cached.box);
  }
  return bounds;
}
