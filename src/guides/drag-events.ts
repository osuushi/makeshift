import { onModelKeydown } from "../sketch/model-keys.js";

/** Guide gestures own their captured pointer, cancellation and trailing synthetic click. */
export class GuideDragEvents {
  private abort = new AbortController();
  private consumeClick = false;
  constructor(actions: {
    move(event: PointerEvent): void;
    release(event: PointerEvent): void;
    cancel(): void;
    active(): boolean;
  }) {
    const options = { capture: true, signal: this.abort.signal };
    window.addEventListener("pointermove", actions.move, options);
    window.addEventListener("pointerup", actions.release, options);
    window.addEventListener("pointercancel", actions.cancel, options);
    window.addEventListener("blur", actions.cancel, { signal: this.abort.signal });
    window.addEventListener(
      "pointerdown",
      () => {
        this.consumeClick = false;
      },
      options,
    );
    window.addEventListener(
      "click",
      (event) => {
        if (!this.consumeClick) return;
        this.consumeClick = false;
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      options,
    );
    onModelKeydown((event) => {
      if (!actions.active() || !["Enter", "Escape"].includes(event.key)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Escape") actions.cancel();
    }, options);
  }
  consume(): void {
    this.consumeClick = true;
  }
  dispose(): void {
    this.abort.abort();
  }
}
