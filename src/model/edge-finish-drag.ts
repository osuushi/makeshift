import { GuideSurfaceSnap } from "../guides/surface-snap.js";
import type { GuideSurfacePlan } from "../guides/tool-path.js";
import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { replayPointerModifiers } from "../sketch/modifier-pointer.js";
import type { Point } from "../sketch/planes.js";
import type { BodyEdgeFinish } from "./body.js";
import type { BodyEdgeFinishWidget } from "./body-edge-finish-widget.js";

/** Owns the edge-size pointer gesture; preview and acceptance stay with the tool. */
export class EdgeFinishDrag {
  private snap: GuideSurfaceSnap;
  private pointer: {
    id: number;
    direction: Point;
    y: number;
    lastY: number;
    size: number;
    scale: number;
    moved: boolean;
  } | null = null;
  get active(): boolean {
    return this.pointer !== null;
  }
  constructor(
    editor: SketchEditor,
    widget: BodyEdgeFinishWidget,
    signal: AbortSignal,
    begin: (mode: BodyEdgeFinish["mode"]) => boolean,
    lease: () => InteractionLease | null,
    size: () => number,
    queue: (size: number) => void,
    focus: () => void,
    snapPlan: () => GuideSurfacePlan | null,
  ) {
    const options = { signal };
    this.snap = new GuideSurfaceSnap(editor, document.body, queue);
    signal.addEventListener("abort", () => this.snap.dispose(), { once: true });
    for (const mode of ["fillet", "chamfer"] as const)
      widget.handles[mode].addEventListener(
        "pointerdown",
        (event) => {
          if (event.button !== 0 || !begin(mode)) return;
          if (!widget.direction) {
            focus();
            event.preventDefault();
            return;
          }
          widget.input.blur();
          this.snap.start(snapPlan);
          const direction = widget.direction;
          this.pointer = {
            direction,
            id: event.pointerId,
            y: event.clientX * direction.x + event.clientY * direction.y,
            lastY: event.clientX * direction.x + event.clientY * direction.y,
            size: Number.isFinite(size()) ? size() : 0,
            scale: editor.world.height / editor.world.canvas.clientHeight,
            moved: false,
          };
          lease()?.capture(widget.handles[mode], event.pointerId);
          event.preventDefault();
        },
        options,
      );
    const move = (event: PointerEvent) => {
      const p = this.pointer;
      if (!p || p.id !== event.pointerId) return;
      p.lastY = event.clientX * p.direction.x + event.clientY * p.direction.y;
      if (Math.abs(p.lastY - p.y) > 3) p.moved = true;
      if (!p.moved) return;
      let value = p.size + (p.lastY - p.y) * p.scale;
      if (editor.gridSnap) value = Math.round(value / editor.world.spacing) * editor.world.spacing;
      this.snap.move(event, value);
    };
    window.addEventListener("pointermove", move, options);
    replayPointerModifiers(signal, () => !!this.pointer, move);
    window.addEventListener(
      "pointerup",
      (event) => {
        if (this.pointer?.id !== event.pointerId) return;
        const moved = this.pointer.moved;
        this.pointer = null;
        this.snap.clear();
        lease()?.releaseCapture();
        if (!moved) focus();
        editor.refresh();
      },
      options,
    );
  }
  rebase(size: number): void {
    if (!this.pointer) return;
    this.pointer.size = size;
    this.pointer.y = this.pointer.lastY;
  }
  clear(): void {
    this.pointer = null;
    this.snap.clear();
  }
}
