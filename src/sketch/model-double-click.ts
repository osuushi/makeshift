import type { SketchEditor } from "./editor.js";
import type { ModelingTarget } from "./model-selection-state.js";
import { pointerDragThreshold } from "./pointer-intent.js";
import { touchSketchTarget } from "./touch-sketch-target.js";

/** Preserve double taps across tip drift and newly displayed modeling widgets. */
export function modelDoubleClick(
  editor: SketchEditor,
  overlay: HTMLElement,
  signal: AbortSignal,
  select: (event: MouseEvent, before: ModelingTarget[]) => void,
): void {
  new ModelDoubleClick(editor, overlay, signal, select);
}
class ModelDoubleClick {
  private before: ModelingTarget[] = [];
  private first: MouseEvent | null = null;
  private second: { down: PointerEvent; pick: MouseEvent } | null = null;
  private consumeClick = false;
  private penClickUntil = 0;
  constructor(
    private editor: SketchEditor,
    private overlay: HTMLElement,
    signal: AbortSignal,
    private select: (event: MouseEvent, before: ModelingTarget[]) => void,
  ) {
    const options = { signal, capture: true };
    editor.world.canvas.addEventListener(
      "dblclick",
      (event) => {
        if (performance.now() >= this.penClickUntil) this.select(event, this.before);
      },
      { signal },
    );
    window.addEventListener(
      "dblclick",
      (event) => {
        if (
          event.target === editor.world.canvas &&
          event instanceof PointerEvent &&
          event.pointerType === "touch" &&
          touchSketchTarget(editor, { x: event.clientX, y: event.clientY })
        )
          this.select(event, this.before);
      },
      options,
    );
    window.addEventListener("click", this.click, options);
    window.addEventListener("pointerdown", this.down, options);
    window.addEventListener("pointerup", this.up, options);
    window.addEventListener("pointercancel", this.reset, options);
    window.addEventListener("blur", this.reset, { signal });
  }
  private click = (event: MouseEvent): void => {
    if (this.consumeClick) {
      this.consumeClick = false;
      consume(event);
      return;
    }
    const pen = event instanceof PointerEvent && event.pointerType === "pen";
    if (pen) this.penClickUntil = performance.now() + 700;
    if (
      pen &&
      this.first instanceof PointerEvent &&
      this.first.pointerType === "pen" &&
      event.target === this.editor.world.canvas &&
      nearby(this.first, event)
    ) {
      const previous = this.first;
      this.first = null;
      consume(event);
      this.select(previous, this.before);
      return;
    }
    // Capture before the canvas click changes faces/edges; a double-click
    // applies its whole-body intent once against this original selection.
    if (event.target === this.editor.world.canvas && event.detail === 1)
      this.before = [...this.editor.modeling.targets];
    this.first = event.target === this.editor.world.canvas && event.detail === 1 ? event : null;
  };
  private down = (event: PointerEvent): void => {
    if (event.pointerType !== "pen") this.penClickUntil = 0;
    const previous = this.first;
    this.first = null;
    const canvas = this.editor.world.canvas;
    if (
      !previous ||
      event.button !== 0 ||
      this.editor.world.active ||
      this.editor.blocked ||
      this.editor.interactions.current ||
      !nearby(previous, event)
    )
      return;
    if (event.target === canvas) {
      if (event.pointerType === "pen") this.first = previous;
      return;
    }
    if (
      !(event.target instanceof Node) ||
      !this.overlay.contains(event.target) ||
      (event.target instanceof Element &&
        event.target.closest(
          ".extrude-axis-sphere, .extrude-twist-handle, .guide-markers, .guide-choices",
        ))
    )
      return;
    this.second = { down: event, pick: previous };
    canvas.setPointerCapture(event.pointerId);
    consume(event);
  };
  private up = (event: PointerEvent): void => {
    if (this.second?.down.pointerId !== event.pointerId) return;
    const { down, pick } = this.second;
    this.second = null;
    this.consumeClick = true;
    consume(event);
    this.editor.world.canvas.focus();
    if (
      Math.hypot(event.clientX - down.clientX, event.clientY - down.clientY) <=
      pointerDragThreshold(down)
    )
      this.select(pick, this.before);
  };
  private reset = (): void => {
    this.first = null;
    this.second = null;
    this.consumeClick = false;
  };
}
function nearby(first: MouseEvent, next: PointerEvent): boolean {
  return (
    next.timeStamp - first.timeStamp <= 500 &&
    Math.hypot(next.clientX - first.clientX, next.clientY - first.clientY) <=
      pointerDragThreshold(next)
  );
}
function consume(event: Event): void {
  event.preventDefault();
  event.stopImmediatePropagation();
}
