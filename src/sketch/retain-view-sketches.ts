import type { Sketch, SketchDocument } from "./document.js";
import type { ModelView } from "./model-api.js";

const encoded = new WeakMap<Sketch, string>();
function content(sketch: Sketch): string {
  let value = encoded.get(sketch);
  if (value === undefined) {
    value = JSON.stringify(sketch);
    encoded.set(sketch, value);
  }
  return value;
}

/** Transport copies must not invalidate profile caches for unchanged, read-only source sketches. */
function retain(previous: SketchDocument, next: SketchDocument): SketchDocument {
  const sketches = next.sketches.map((sketch) => {
    const source = previous.sketches.find((source) => source.id === sketch.id);
    return source && (source === sketch || content(source) === content(sketch)) ? source : sketch;
  });
  const retained =
    sketches.length === previous.sketches.length &&
    sketches.every((sketch, i) => sketch === previous.sketches[i])
      ? previous.sketches
      : sketches;
  return retained === next.sketches ? next : { ...next, sketches: retained };
}

export function retainViewSketches(previous: ModelView, next: ModelView): ModelView {
  const data = retain(previous.data, next.data);
  return { ...next, data, candidate: next.candidate && retain(data, next.candidate) };
}
