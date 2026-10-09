import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import { replayPointerModifiers } from "../sketch/modifier-pointer.js";
import { snapRotation } from "../sketch/rotation-snap.js";
import { numericFocus } from "../tools/menu-focus.js";
import type { dragFrame } from "./body-drag.js";
export interface GizmoPointer {
  id: number;
  x: number;
  y: number;
  moved: boolean;
  frame: ReturnType<typeof dragFrame>;
}
interface GizmoActions {
  gesture: () => { pointer: GizmoPointer; rotate: boolean } | null;
  active: () => boolean;
  queue: (value: number) => void;
  release: (moved: boolean) => void;
  finish: () => Promise<unknown>;
  cancel: () => void | Promise<void>;
  modifiers?: (event: PointerEvent) => void;
  snap?: (event: PointerEvent, value: number) => number;
  viewportOnly?: boolean;
}
/** Shared current body/topology gizmo input ownership; controllers own previews and leases. */
export class GizmoInputs {
  constructor(
    private editor: SketchEditor,
    private input: HTMLInputElement,
    signal: AbortSignal,
    private actions: GizmoActions,
  ) {
    const options = { signal };
    window.addEventListener(
      "pointerdown",
      (event) => {
        // A fresh handle press returns ownership from numeric entry to dragging.
        if (actions.gesture()?.pointer.id === event.pointerId && event.target !== input)
          input.blur();
      },
      options,
    );
    window.addEventListener("pointermove", this.move, options);
    replayPointerModifiers(signal, () => !!actions.gesture(), this.move);
    window.addEventListener(
      "pointerup",
      (event) => {
        const gesture = actions.gesture();
        if (!gesture || gesture.pointer.id !== event.pointerId) return;
        this.move(event);
        actions.release(gesture.pointer.moved);
      },
      options,
    );
    input.addEventListener(
      "input",
      () => actions.queue(input.value.trim() ? Number(input.value) : NaN),
      options,
    );
    onModelKeydown(
      (event) => {
        if (
          (actions.viewportOnly && editor.world.active) ||
          !actions.active() ||
          !["Enter", "Escape"].includes(event.key)
        )
          return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.key === "Escape") void actions.cancel();
        else void actions.finish();
      },
      { ...options, capture: true },
    );
    window.addEventListener("pointercancel", () => void actions.cancel(), options);
  }
  private move = (event: PointerEvent): void => {
    // Tab hands the held gesture to exact numeric entry, including at release.
    if (numericFocus(this.input)) return;
    const gesture = this.actions.gesture();
    if (!gesture || gesture.pointer.id !== event.pointerId) return;
    const { pointer, rotate } = gesture;
    this.actions.modifiers?.(event);
    pointer.moved ||= Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 3;
    if (!pointer.moved) return;
    const step = this.editor.world.spacing / (event.shiftKey ? 10 : 1);
    let value = rotate
      ? snapRotation(pointer.frame.angle(event.clientX, event.clientY), event.shiftKey)
      : pointer.frame.translation(event.clientX, event.clientY);
    if (!rotate && this.editor.gridSnap) value = Math.round(value / step) * step;
    this.actions.queue(this.actions.snap?.(event, value) ?? value);
  };
}
