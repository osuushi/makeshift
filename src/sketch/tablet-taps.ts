import type { World } from "./world.js";

/** Camera fingers still select and enter workspaces when they never become navigation. */
export class TabletTaps {
  private down: PointerEvent | null = null;
  private first: PointerEvent | null = null;
  replaying = false;
  constructor(private world: World) {}
  continuing(event: PointerEvent): boolean {
    return (
      !!this.first &&
      event.timeStamp - this.first.timeStamp <= 500 &&
      Math.hypot(event.clientX - this.first.clientX, event.clientY - this.first.clientY) <= 16
    );
  }
  start(event: PointerEvent, contacts: number): void {
    if (contacts || this.world.active) {
      this.cancel();
      return;
    }
    this.down = event;
  }
  move(event: PointerEvent): void {
    if (
      this.down &&
      Math.hypot(event.clientX - this.down.clientX, event.clientY - this.down.clientY) >= 6
    )
      this.cancel();
  }
  release(event: PointerEvent): void {
    const down = this.down;
    this.down = null;
    if (!down || event.type !== "pointerup" || event.timeStamp - down.timeStamp >= 300) {
      this.first = null;
      return;
    }
    const double = this.continuing(down);
    this.first = double ? null : down;
    this.replaying = true;
    try {
      this.world.canvas.focus();
      this.world.canvas.dispatchEvent(
        new PointerEvent(double ? "dblclick" : "click", {
          bubbles: true,
          cancelable: true,
          pointerType: "touch",
          pointerId: down.pointerId,
          button: 0,
          detail: double ? 2 : 1,
          clientX: down.clientX,
          clientY: down.clientY,
          shiftKey: down.shiftKey,
          metaKey: down.metaKey,
          ctrlKey: down.ctrlKey,
        }),
      );
    } finally {
      this.replaying = false;
    }
  }
  cancel(): void {
    this.down = this.first = null;
  }
}
