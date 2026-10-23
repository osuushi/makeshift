import type { SketchEditor } from "../sketch/editor.js";

export const transformLayers = ["move", "rotate", "scale"] as const;
export type TransformLayer = (typeof transformLayers)[number];

/** Window UI state; explicit layer changes alone update the recalled combination. */
export class TransformLayers {
  private current = new Set<TransformLayer>(["move"]);
  private remembered = new Set<TransformLayer>(transformLayers);
  enabled(layer: TransformLayer): boolean {
    return this.current.has(layer);
  }
  get size(): number {
    return this.current.size;
  }
  enter(layer?: TransformLayer): void {
    this.current = layer ? new Set([layer]) : new Set(this.remembered);
  }
  toggle(layer: TransformLayer): boolean {
    if (this.current.has(layer)) {
      if (this.current.size === 1) return false;
      this.current.delete(layer);
    } else this.current.add(layer);
    this.remembered = new Set(this.current);
    return true;
  }
}
const states = new WeakMap<SketchEditor, TransformLayers>();
export function transformLayerState(editor: SketchEditor): TransformLayers {
  let state = states.get(editor);
  if (!state) {
    state = new TransformLayers();
    states.set(editor, state);
  }
  return state;
}
export function transformLayerEnabled(editor: SketchEditor, layer: TransformLayer): boolean {
  return transformLayerState(editor).enabled(layer);
}

export function activeTransformTool(editor: SketchEditor): TransformLayer | "transform" {
  const state = transformLayerState(editor);
  return state.size === 1
    ? (transformLayers.find((layer) => state.enabled(layer)) ?? "move")
    : "transform";
}
