import { copySketchGuides } from "../guides/sketch-continuation.js";
import type { InteractionLease } from "../sketch/active-interaction.js";
import { copySketch } from "../sketch/copy-selection.js";
import { type SketchDocument, withSketch } from "../sketch/document.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { ModelRequest } from "../sketch/model-api.js";
import type { PlaneFrame, Vector } from "../sketch/planes.js";
import { transformSelected } from "../sketch/selection-transform.js";
import { placedDocument } from "./body-placement.js";
import type { ScaleSource } from "./scale.js";

export async function previewBoxMove(
  editor: SketchEditor,
  source: ScaleSource,
  origin: Vector,
  delta: Vector,
  lease: InteractionLease,
  duplicate = false,
  copyIds = new Map<string, string>(),
): Promise<boolean> {
  const document = editor.store.data;
  if (source.kind === "curves") {
    const sketch = document.sketches.find((s) => s.id === source.sketchId);
    if (!sketch) return false;
    const moved = transformSelected(editor, sketch, (p) => ({
      x: p.x + delta.reduce((sum, v, i) => sum + v * sketch.plane.u[i], 0),
      y: p.y + delta.reduce((sum, v, i) => sum + v * sketch.plane.v[i], 0),
    }));
    const valid = await editor.store.request({ kind: "preview", sketch: moved });
    if (valid) lease.show(editor.store.candidate);
    return valid;
  }
  if (source.kind === "sketches") {
    let next = document;
    const frames = translatedSketchFrames(document, source.ids, delta);
    if (!frames) return false;
    for (const { sketchId, frame } of frames) {
      const sketch = document.sketches.find((s) => s.id === sketchId);
      if (sketch) {
        const placed = duplicate ? copySketch(sketch, copyIds) : sketch;
        next = withSketch(next, { ...placed, plane: frame });
        if (duplicate) next = copySketchGuides(next, sketch.id, placed.id, copyIds);
      }
    }
    lease.show(next);
    return true;
  }
  if (!source.faces.length && !source.edges.length) {
    if (!document.bodies?.some((body) => source.ids.includes(body.id))) return false;
    lease.show(
      placedDocument(document, {
        ids: source.ids,
        pivot: origin,
        translation: delta,
        axis: [0, 0, 1],
        angle: 0,
        duplicate,
      }),
    );
    return true;
  }
  const request = source.faces.length
    ? {
        kind: "move-faces" as const,
        operation: {
          faces: source.faces,
          bodyIds: source.ids,
          pivot: origin,
          axis: [0, 0, 1] as Vector,
          angle: 0,
          translation: delta,
        },
      }
    : {
        kind: "move-edges" as const,
        operation: { edges: source.edges, bodyIds: source.ids, translation: delta },
      };
  const valid = await editor.store.request(request);
  if (valid) lease.show(editor.store.candidate);
  return valid;
}

export function translatedSketchFrames(
  document: SketchDocument,
  ids: string[],
  delta: Vector,
): { sketchId: string; frame: PlaneFrame }[] | null {
  const frames: { sketchId: string; frame: PlaneFrame }[] = [];
  for (const id of ids) {
    const sketch = document.sketches.find((s) => s.id === id);
    if (!sketch) return null;
    frames.push({
      sketchId: id,
      frame: {
        ...sketch.plane,
        origin: sketch.plane.origin.map((v, i) => v + delta[i]) as Vector,
      },
    });
  }
  return frames;
}

/** Build the accepted edit from the same source and delta used for preview. */
export function boxMoveRequest(
  document: SketchDocument,
  source: ScaleSource,
  origin: Vector,
  delta: Vector,
  duplicate = false,
): ModelRequest | null {
  if (source.kind === "sketches") {
    const frames = translatedSketchFrames(document, source.ids, delta);
    return frames?.length
      ? { kind: "place-sketch", ...frames[0], additional: frames.slice(1), duplicate }
      : null;
  }
  if (source.kind === "solids" && !source.faces.length && !source.edges.length)
    return {
      kind: "transform-bodies",
      transform: {
        ids: source.ids,
        pivot: origin,
        axis: [0, 0, 1],
        angle: 0,
        translation: delta,
        duplicate,
      },
    };
  return { kind: "accept" };
}
