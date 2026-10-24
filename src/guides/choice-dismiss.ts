import type { Point } from "../sketch/planes.js";

/** Keep a chooser while either its source point or its panel is under the pointer. */
export class GuideChoiceDismiss {
  private source: Point | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private fade: ReturnType<typeof setTimeout> | null = null;
  private abort = new AbortController();
  constructor(
    private element: HTMLElement,
    private dismissed: () => void,
  ) {
    window.addEventListener("pointermove", (event) => this.track(event), {
      capture: true,
      signal: this.abort.signal,
    });
  }
  open(source: Point): void {
    this.close();
    this.source = source;
  }
  private track(event: PointerEvent): void {
    if (!this.source || this.element.hidden) return;
    const box = this.element.getBoundingClientRect();
    const inside =
      event.clientX >= box.left - 4 &&
      event.clientX <= box.right + 4 &&
      event.clientY >= box.top - 4 &&
      event.clientY <= box.bottom + 4;
    if (inside || Math.hypot(event.clientX - this.source.x, event.clientY - this.source.y) <= 20) {
      this.clear();
      return;
    }
    if (this.timer !== null || this.fade !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.element.classList.add("fading");
      this.fade = setTimeout(() => {
        this.close();
        this.dismissed();
      }, 150);
    }, 500);
  }
  private clear(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    if (this.fade !== null) clearTimeout(this.fade);
    this.timer = this.fade = null;
    this.element.classList.remove("fading");
  }
  close(): void {
    this.clear();
    this.source = null;
  }
  dispose(): void {
    this.close();
    this.abort.abort();
  }
}
