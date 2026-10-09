import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { handoffModalPointer } from "./modal-pointer-handoff.js";

/** Pointer capture keeps mouse, Pencil and touch on the same panel-only route. */
export class EntityReorder {
  private abort = new AbortController();
  private start: { x: number; y: number; pointer: number } | null = null;
  private lease: InteractionLease | null = null;
  private before: string | null | undefined;
  private marker: HTMLElement | null = null;
  private suppressClick = false;
  private point: { x: number; y: number } | null = null;
  private scrollFrame = 0;
  constructor(
    private editor: SketchEditor,
    private row: HTMLElement,
    private label: HTMLButtonElement,
    id: string,
    group: string,
    private localSelection: () => boolean = () => false,
  ) {
    row.dataset.entity = id;
    row.dataset.entityGroup = group;
    label.classList.add("entity-label");
    label.addEventListener("pointerdown", this.down);
    label.addEventListener("pointermove", this.move);
    label.addEventListener("pointerup", (event) => {
      if (this.start?.pointer === event.pointerId) this.end(true);
    });
    label.addEventListener("pointercancel", () => this.end(false));
    label.addEventListener("lostpointercapture", () => this.end(false));
    label.addEventListener(
      "click",
      (event) => {
        if (!this.suppressClick) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.suppressClick = false;
      },
      { capture: true },
    );
  }
  private down = (event: PointerEvent): void => {
    if (!this.localSelection() && handoffModalPointer(this.editor, event, this.abort.signal))
      return;
    if (this.start) return;
    this.suppressClick = false;
    if (event.button !== 0 || this.editor.blocked || this.editor.interactions.current) return;
    this.start = { x: event.clientX, y: event.clientY, pointer: event.pointerId };
    try {
      this.label.setPointerCapture(event.pointerId);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error;
    }
  };
  private move = (event: PointerEvent): void => {
    const start = this.start;
    if (!start || start.pointer !== event.pointerId) return;
    if (!this.lease) {
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6) return;
      this.lease = this.editor.interactions.acquire("entity-reorder", () => this.end(false));
      if (!this.lease) {
        this.end(false);
        return;
      }
      this.suppressClick = true;
      this.lease.capture(this.label, event.pointerId);
      this.row.classList.add("entity-dragging");
    }
    event.preventDefault();
    this.point = { x: event.clientX, y: event.clientY };
    this.locate(event.clientX, event.clientY);
    if (!this.scrollFrame) this.scrollFrame = requestAnimationFrame(this.scroll);
  };
  private locate(x: number, y: number): void {
    this.clearMarker();
    const panel = this.row.closest(".entity-viewer");
    if (!(panel instanceof HTMLElement)) return;
    const bounds = panel.getBoundingClientRect();
    if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return;
    const rows = Array.from(panel.querySelectorAll<HTMLElement>(".entity-row")).filter(
      (row) => row.dataset.entityGroup === this.row.dataset.entityGroup,
    );
    const first = rows[0]?.getBoundingClientRect(),
      last = rows.at(-1)?.getBoundingClientRect();
    if (!first || !last || y < first.top - 4 || y > last.bottom + 4) return;
    const others = rows.filter((row) => row !== this.row);
    const next = others.find((row) => {
      const rect = row.getBoundingClientRect();
      return y < rect.top + rect.height / 2;
    });
    this.marker = next ?? others.at(-1) ?? null;
    if (!this.marker) return;
    this.before = next?.dataset.entity ?? null;
    this.marker.classList.add(next ? "entity-drop-before" : "entity-drop-after");
  }
  private scroll = (): void => {
    this.scrollFrame = 0;
    const panel = this.row.closest(".entity-viewer"),
      point = this.point;
    if (!this.lease || !point || !(panel instanceof HTMLElement)) return;
    const bounds = panel.getBoundingClientRect();
    if (
      point.x >= bounds.left &&
      point.x <= bounds.right &&
      point.y >= bounds.top &&
      point.y <= bounds.bottom
    ) {
      const step = point.y < bounds.top + 24 ? -6 : point.y > bounds.bottom - 24 ? 6 : 0;
      if (step) {
        panel.scrollTop += step;
        this.locate(point.x, point.y);
      }
    }
    this.scrollFrame = requestAnimationFrame(this.scroll);
  };
  private clearMarker(): void {
    this.marker?.classList.remove("entity-drop-before", "entity-drop-after");
    this.marker = null;
    this.before = undefined;
  }
  private end(accept: boolean): void {
    const start = this.start,
      lease = this.lease,
      beforeId = this.before;
    this.start = null;
    this.lease = null;
    this.point = null;
    cancelAnimationFrame(this.scrollFrame);
    this.scrollFrame = 0;
    this.clearMarker();
    this.row.classList.remove("entity-dragging");
    lease?.release();
    if (start && this.label.hasPointerCapture(start.pointer))
      this.label.releasePointerCapture(start.pointer);
    if (accept && lease && beforeId !== undefined && this.row.isConnected && !this.editor.blocked)
      void this.editor.store
        .request({
          kind: "reorder-entity",
          id: this.row.dataset.entity as string,
          beforeId,
        })
        .then(() => this.editor.refresh());
  }
}
