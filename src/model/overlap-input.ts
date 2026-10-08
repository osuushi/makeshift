import type { SketchEditor } from "../sketch/editor.js";
import type { PlaneId } from "../sketch/planes.js";
import { pointerDragThreshold } from "../sketch/pointer-intent.js";
import { toolCatalog } from "../tools/catalog.js";
import type { ConstructionPlane } from "./construction-plane.js";
import { OverlapChooser } from "./overlap-chooser.js";
import "./overlap.css";

// Shared by the hold timer and its visual countdown; future preferences can supply this value.
const longPressDelayMs = 300;

/** Observe ordinary presses without delaying clicks or claiming normal drags. */
export class OverlapInput {
  private abort = new AbortController();
  private chooser: OverlapChooser;
  private pending: PointerEvent | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ring = document.createElement("div");
  private suppress: number | null = null;
  constructor(
    private editor: SketchEditor,
    selectPlane: (p: ConstructionPlane | PlaneId) => void,
  ) {
    this.chooser = new OverlapChooser(editor, selectPlane);
    this.ring.className = "selection-hold";
    this.ring.style.setProperty("--hold-duration", `${longPressDelayMs}ms`);
    this.ring.innerHTML = `<span class="selection-hold-progress" aria-hidden="true"></span>`;
    this.ring.hidden = true;
    document.body.append(this.ring);
    const options = { capture: true, signal: this.abort.signal };
    for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel"] as const)
      window.addEventListener(type, this.pointer, options);
    for (const type of ["click", "dblclick"])
      window.addEventListener(
        type,
        (event) => {
          if (this.suppress !== null && event instanceof MouseEvent && event.detail > 0)
            consume(event);
        },
        options,
      );
    window.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape" && (this.pending || this.chooser.opened)) {
          if (this.pending) {
            this.suppress = this.pending.pointerId;
            if (this.editor.interactions.current?.kind === "model-selection")
              this.editor.interactions.requestCancel();
          }
          this.cancelPending();
          consume(event);
          this.chooser.close();
        } else {
          this.cancelPending();
          if (
            this.chooser.opened &&
            ![
              "Tab",
              "Enter",
              " ",
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "Shift",
              "Control",
              "Meta",
              "Alt",
            ].includes(event.key)
          )
            this.chooser.close();
        }
      },
      options,
    );
    window.addEventListener("wheel", () => this.cancel(), { ...options, passive: true });
    window.addEventListener("blur", () => this.cancel(), { signal: this.abort.signal });
    window.addEventListener("resize", () => this.cancel(), options);
    // Remote touch navigation runs earlier and consumes events on the canvas.
    editor.world.longPress = this.pointer;
  }
  private pointer = (event: PointerEvent): void => {
    if (event.type === "pointerdown") {
      this.start(event);
      return;
    }
    if (this.suppress === event.pointerId) {
      if (this.chooser.opened) {
        if (event.type === "pointermove") this.chooser.drag(event);
        else if (event.type === "pointerup") this.chooser.release(event);
        else this.chooser.close();
        consume(event);
      } else if (event.type !== "pointermove") consume(event);
      return;
    }
    if (this.pending?.pointerId !== event.pointerId) return;
    if (
      event.type !== "pointermove" ||
      Math.hypot(event.clientX - this.pending.clientX, event.clientY - this.pending.clientY) >
        (this.pending.pointerType === "touch" ? 6 : pointerDragThreshold(this.pending))
    )
      this.cancelPending();
  };
  private start(event: PointerEvent): void {
    if (this.pending) {
      this.cancelPending();
      return;
    }
    this.suppress = null;
    if (this.chooser.element.contains(event.target as Node)) return;
    this.chooser.close();
    const e = this.editor;
    if (
      event.target !== e.world.canvas ||
      event.button !== 0 ||
      !event.isPrimary ||
      (e.interactions.current?.kind === "tag-membership"
        ? e.blocked
        : !!toolCatalog(e).reason({ reason: () => null })) ||
      e.world.active ||
      e.interactions.current?.selectsLocally() ||
      e.world.planePicker ||
      e.world.cameraTransitioning
    )
      return;
    this.pending = event;
    this.ring.style.left = `${event.clientX}px`;
    this.ring.style.top = `${event.clientY}px`;
    this.ring.hidden = false;
    this.timer = setTimeout(() => void this.hold(event), longPressDelayMs);
  }
  private async hold(event: PointerEvent): Promise<void> {
    if (this.pending !== event) return;
    this.cancelPending();
    // Canceling marquee capture can emit lostpointercapture; the chooser owns no capture.
    await this.chooser.open(event);
    if (this.chooser.opened) {
      this.suppress = event.pointerId;
      this.chooser.drag(event);
    }
  }
  private cancelPending(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
    this.ring.hidden = true;
  }
  private cancel(): void {
    this.cancelPending();
    this.chooser.close();
  }
  dispose(): void {
    this.cancel();
    this.abort.abort();
    this.chooser.dispose();
    this.ring.remove();
    this.editor.world.longPress = null;
  }
}
function consume(event: Event): void {
  event.preventDefault();
  event.stopImmediatePropagation();
}
