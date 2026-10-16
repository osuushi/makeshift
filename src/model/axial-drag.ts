import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { pickModels } from "../sketch/model-selection.js";
import { replayPointerModifiers } from "../sketch/modifier-pointer.js";
import type { Vector } from "../sketch/planes.js";
import { pointerDragThreshold } from "../sketch/pointer-intent.js";
import { projectedAxis } from "./extrude-axis.js";

/** Shared signed-distance gesture for extrusion and face offset. */
export class AxialDrag {
  private pointer: {
    id: number;
    x: number;
    y: number;
    value: number;
    symmetric: boolean;
    direction: ReturnType<typeof projectedAxis>;
    moved: boolean;
    threshold: number;
  } | null = null;
  get active(): boolean {
    return !!this.pointer;
  }
  reset(): void {
    this.pointer = null;
  }
  constructor(
    editor: SketchEditor,
    handle: HTMLButtonElement,
    signal: AbortSignal,
    state: {
      begin: () => boolean;
      lease: () => InteractionLease | null;
      axis: () => { center: Vector; normal: Vector } | null;
      value: () => number;
      queue: (value: number, symmetric?: boolean) => void;
      symmetric?: () => boolean;
      focus: () => void;
      modifySelection?: boolean;
    },
  ) {
    const options = { signal };
    handle.addEventListener(
      "pointerdown",
      (e) => {
        if (e.button !== 0) return;
        if (state.modifySelection && !state.lease() && (e.shiftKey || e.metaKey || e.ctrlKey)) {
          const hits = pickModels(editor, { x: e.clientX, y: e.clientY });
          editor.modeling.choose(hits[0] ?? null, e.shiftKey, e.metaKey || e.ctrlKey);
          editor.modeling.alternatives = hits.slice(1);
          editor.refresh();
          return;
        }
        if (!state.begin()) return;
        const axis = state.axis();
        if (!axis) return;
        if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur();
        const symmetric = state.symmetric?.() ?? false;
        const value = state.value() / (symmetric ? 2 : 1);
        const center = axis.center.map((v, i) => v + axis.normal[i] * value) as Vector;
        this.pointer = {
          id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          value,
          symmetric,
          direction: projectedAxis(editor, center, axis.normal),
          moved: false,
          threshold: pointerDragThreshold(e),
        };
        state.lease()?.capture(handle, e.pointerId);
        e.preventDefault();
        editor.refresh();
      },
      options,
    );
    const move = (e: PointerEvent) => {
      const p = this.pointer;
      if (!p || p.id !== e.pointerId) return;
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > p.threshold) p.moved = true;
      if (!p.moved) return;
      let value =
        p.value +
        ((e.clientX - p.x) * p.direction.x + (e.clientY - p.y) * p.direction.y) / p.direction.scale;
      if (editor.gridSnap) value = Math.round(value / editor.world.spacing) * editor.world.spacing;
      const symmetric = !!state.symmetric && (p.symmetric || e.altKey);
      state.queue(value * (symmetric ? 2 : 1), symmetric);
    };
    window.addEventListener("pointermove", move, options);
    replayPointerModifiers(signal, () => !!this.pointer, move);
    window.addEventListener(
      "pointerup",
      (e) => {
        if (this.pointer?.id !== e.pointerId) return;
        move(e);
        const moved = this.pointer.moved;
        this.reset();
        state.lease()?.releaseCapture();
        if (!moved) state.focus();
        editor.refresh();
      },
      options,
    );
  }
}
