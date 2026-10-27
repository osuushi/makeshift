import type { SketchDocument } from "./document.js";
import type { ModelView } from "./model-api.js";

const encoded = new WeakMap<object, string>();
function content(sketch: object): string {
  let value = encoded.get(sketch);
  if (value === undefined) {
    value = JSON.stringify(sketch);
    encoded.set(sketch, value);
  }
  return value;
}

/** Transport copies must not invalidate geometry caches for unchanged read-only inputs. */
function retain(previous: SketchDocument, next: SketchDocument): SketchDocument {
  if (previous === next) return next;
  const sketches = next.sketches.map((sketch) => {
    const source = previous.sketches.find((source) => source.id === sketch.id);
    return source && (source === sketch || content(source) === content(sketch)) ? source : sketch;
  });
  const retained =
    sketches.length === previous.sketches.length &&
    sketches.every((sketch, i) => sketch === previous.sketches[i])
      ? previous.sketches
      : sketches;
  const bodies = next.bodies?.map((body) => {
    const source = previous.bodies?.find((source) => source.id === body.id);
    return source && (source === body || content(source) === content(body)) ? source : body;
  });
  const retainedBodies =
    bodies?.length === previous.bodies?.length &&
    bodies?.every((body, i) => body === previous.bodies?.[i])
      ? previous.bodies
      : bodies;
  return { ...next, sketches: retained, ...(next.bodies ? { bodies: retainedBodies } : {}) };
}

export function retainViewSketches(previous: ModelView, next: ModelView): ModelView {
  const data = retain(previous.data, next.data);
  return { ...next, data, candidate: next.candidate && retain(data, next.candidate) };
}
