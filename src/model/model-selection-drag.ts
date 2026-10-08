import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { selectModelsInFrustum } from "../sketch/model-selection.js";
import { penSelectionClick, pointerDragThreshold } from "../sketch/pointer-intent.js";
import { handoffModalPointer } from "./modal-pointer-handoff.js";

const drags = new WeakMap<SketchEditor, ModelSelectionDrag>();
export function cancelModelSelectionDrag(editor: SketchEditor): void {
  drags.get(editor)?.reset(true);
}

/** A modeling-space marquee; it only changes transient topology selection. */
export class ModelSelectionDrag {
  private readonly box = document.createElement("div");
  private readonly abort = new AbortController();
  private start: PointerEvent | null = null;
  private pointerId: number | null = null;
  private interaction: InteractionLease | null = null;
  private additive = false;
  private toggle = false;
  private ignoreClick = false;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
    private available: () => boolean,
  ) {
    drags.set(editor, this);
    this.box.className = "model-selection-box";
    this.box.hidden = true;
    overlay.append(this.box);
    const options = { signal: this.abort.signal },
      canvas = editor.world.canvas;
    canvas.addEventListener("pointerdown", this.begin, options);
    canvas.addEventListener("pointermove", this.move, options);
    canvas.addEventListener("pointerup", this.end, options);
    canvas.addEventListener("pointercancel", this.cancel, options);
    // Consume the release click before plane-entry capture handlers can claim it.
    window.addEventListener(
      "click",
      (event) => {
        if (!this.ignoreClick || event.target !== canvas) return;
        this.ignoreClick = false;
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      { ...options, capture: true },
    );
  }
  private begin = (event: PointerEvent): void => {
    if (
      !this.editor.interactions.current?.selectsLocally() &&
      this.editor.interactions.current?.kind !== "tag-membership" &&
      !this.editor.world.planePicker &&
      !this.editor.world.planePickerAccept &&
      handoffModalPointer(this.editor, event, this.abort.signal)
    )
      return;
    if (
      event.button !== 0 ||
      this.pointerId !== null ||
      this.editor.world.active ||
      this.editor.blocked ||
      this.editor.isDragging ||
      (event.metaKey && this.editor.world.transformBoxContains?.(event.clientX, event.clientY)) ||
      !this.available()
    )
      return;
    const interaction =
      this.editor.interactions.current?.kind === "tag-membership"
        ? this.editor.interactions.current
        : this.editor.interactions.acquire("model-selection", () => this.reset());
    if (!interaction) return;
    this.ignoreClick = false;
    this.start = event;
    this.pointerId = event.pointerId;
    this.interaction = interaction;
    this.toggle = event.metaKey || event.ctrlKey;
    this.additive = event.shiftKey || event.metaKey || event.ctrlKey;
    interaction.capture(this.editor.world.canvas, event.pointerId);
  };
  private move = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId || !this.start) return;
    if (
      Math.hypot(event.clientX - this.start.clientX, event.clientY - this.start.clientY) <=
      pointerDragThreshold(this.start)
    )
      return;
    const left = Math.min(this.start.clientX, event.clientX),
      top = Math.min(this.start.clientY, event.clientY);
    this.box.hidden = false;
    this.box.style.left = `${left}px`;
    this.box.style.top = `${top}px`;
    this.box.style.width = `${Math.abs(event.clientX - this.start.clientX)}px`;
    this.box.style.height = `${Math.abs(event.clientY - this.start.clientY)}px`;
  };
  private end = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId || !this.start) return;
    this.move(event);
    const down = this.start,
      start = { x: down.clientX, y: down.clientY },
      moved = !this.box.hidden;
    this.interaction?.releaseCapture();
    if (moved) {
      const selected = selectModelsInFrustum(this.editor, start, {
        x: event.clientX,
        y: event.clientY,
      });
      if (!this.additive) this.editor.modeling.targets = [];
      for (const target of selected) this.editor.modeling.choose(target, true, this.toggle);
      this.editor.modeling.alternatives = [];
      this.editor.refresh();
      this.ignoreClick = true;
    }
    this.reset();
    if (!moved && down.pointerType === "pen") {
      const canvas = this.editor.world.canvas;
      canvas.focus();
      canvas.dispatchEvent(penSelectionClick(down));
      this.ignoreClick = true;
    }
  };
  reset = (suppressClick = false): void => {
    if (suppressClick && this.start) this.ignoreClick = true;
    this.box.hidden = true;
    this.start = null;
    this.pointerId = null;
    const interaction = this.interaction;
    this.interaction = null;
    if (interaction?.kind === "tag-membership") interaction.releaseCapture();
    else interaction?.release();
  };
  private cancel = (event: PointerEvent): void => {
    if (event.pointerId === this.pointerId) this.reset();
  };
  dispose(): void {
    drags.delete(this.editor);
    this.reset();
    this.abort.abort();
    this.box.remove();
  }
}
