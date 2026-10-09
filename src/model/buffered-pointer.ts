/** The physical gesture can end while a previous transform is completing. */
export class BufferedPointer {
  private listeners = new AbortController();
  private cancelled = false;
  private modifiers: Pick<PointerEvent, "metaKey" | "shiftKey" | "altKey" | "ctrlKey">;
  position: { x: number; y: number };
  released = false;
  doubleClicked = false;

  constructor(
    private press: PointerEvent,
    private parent: AbortSignal,
  ) {
    this.position = { x: press.clientX, y: press.clientY };
    this.modifiers = {
      metaKey: press.metaKey,
      shiftKey: press.shiftKey,
      altKey: press.altKey,
      ctrlKey: press.ctrlKey,
    };
    const options = { signal: this.listeners.signal, capture: true };
    window.addEventListener("pointermove", this.track, options);
    window.addEventListener("pointerup", this.track, options);
    window.addEventListener("pointercancel", this.pointerCancel, options);
    window.addEventListener(
      "dblclick",
      (event) => {
        if (Math.hypot(event.clientX - press.clientX, event.clientY - press.clientY) <= 4)
          this.doubleClicked = true;
      },
      options,
    );
    window.addEventListener("blur", this.cancel, { signal: this.listeners.signal });
    window.addEventListener("keydown", this.key, options);
    window.addEventListener("keyup", this.key, options);
    parent.addEventListener("abort", this.cancel, options);
    if (parent.aborted) this.cancel();
  }

  get valid(): boolean {
    return !this.cancelled && !this.parent.aborted;
  }

  event(type: string, position = this.position): PointerEvent {
    return new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: this.press.pointerId,
      pointerType: this.press.pointerType,
      isPrimary: this.press.isPrimary,
      button: this.press.button,
      buttons: type === "pointerup" ? 0 : this.press.buttons,
      clientX: position.x,
      clientY: position.y,
      ...this.modifiers,
    });
  }

  private track = (event: PointerEvent): void => {
    if (event.pointerId !== this.press.pointerId || this.released) return;
    this.position = { x: event.clientX, y: event.clientY };
    this.setModifiers(event);
    this.released ||= event.type === "pointerup";
  };

  private key = (event: KeyboardEvent): void => {
    this.setModifiers(event);
  };

  private setModifiers(event: KeyboardEvent | PointerEvent): void {
    this.modifiers = {
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
    };
  }

  private pointerCancel = (event: PointerEvent): void => {
    if (event.pointerId === this.press.pointerId) this.cancel();
  };

  cancel = (): void => {
    this.cancelled = true;
    this.dispose();
  };

  dispose(): void {
    this.listeners.abort();
  }
}
