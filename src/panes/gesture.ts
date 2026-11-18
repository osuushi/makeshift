/** Keep capture on the handle throughout a drag, including touch input. */
export function gesture(
  handle: HTMLElement,
  start: (event: PointerEvent) => {
    move?(dx: number, dy: number, event: PointerEvent): void;
    end?(dragged: boolean, event: PointerEvent): void;
    cancel?(): void;
  },
) {
  // A touch release can move the handle away before the browser synthesizes its click.
  // These handles already activate on pointerup, so that click must not hit the canvas below.
  handle.addEventListener("touchend", (event) => event.preventDefault(), { passive: false });
  handle.onpointerdown = (down) => {
    if (down.button || !down.isPrimary) return;
    down.preventDefault();
    const action = start(down);
    let dragged = false;
    handle.setPointerCapture(down.pointerId);
    handle.onpointermove = (event) => {
      if (event.pointerId !== down.pointerId) return;
      const dx = event.clientX - down.clientX,
        dy = event.clientY - down.clientY;
      dragged ||= Math.hypot(dx, dy) >= 4;
      if (dragged) action.move?.(dx, dy, event);
    };
    const clear = () => {
      handle.onpointermove = handle.onpointerup = handle.onlostpointercapture = null;
    };
    handle.onpointerup = (event) => {
      if (event.pointerId !== down.pointerId) return;
      clear();
      action.end?.(dragged, event);
    };
    handle.onlostpointercapture = () => {
      clear();
      action.cancel?.();
    };
  };
}
