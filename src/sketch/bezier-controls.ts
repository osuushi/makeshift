import type { InteractionLease } from "./active-interaction.js";
import { editBezierHandle } from "./bezier-edit.js";
import type { Bezier, Sketch } from "./document.js";
import type { SketchEditor } from "./editor.js";
import { GestureSolve } from "./gesture-solve.js";
import { replayPointerModifiers } from "./modifier-pointer.js";
import { penDirection } from "./pen-geometry.js";
import { distance } from "./point-math.js";
import { snapped } from "./snapping.js";

const ns = "http://www.w3.org/2000/svg";
type Handle = { curve: Bezier; key: "c1" | "c2" };
type Session = Handle & {
  sketch: Sketch;
  solve: GestureSolve;
  lease: InteractionLease;
  pointer: number;
};
export class BezierControls {
  private readonly root = document.createElementNS(ns, "svg");
  private readonly abort = new AbortController();
  private session: Session | null = null;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.root.classList.add("handles");
    this.root.setAttribute("aria-label", "Cubic tangent handles");
    overlay.append(this.root);
    const options = { signal: this.abort.signal, capture: true };
    const canvas = editor.world.canvas;
    canvas.addEventListener("pointerdown", this.start, options);
    canvas.addEventListener("pointermove", this.move, options);
    canvas.addEventListener("pointerup", this.release, options);
    canvas.addEventListener("pointercancel", () => void this.cancel(), options);
    replayPointerModifiers(this.abort.signal, () => !!this.session, this.move);
    editor.world.changed.add(this.draw);
  }
  private handles(): Handle[] {
    if (!this.editor.world.active || this.editor.moveMode || this.editor.tool === "pen") return [];
    return (
      this.editor.sketch?.curves.flatMap((c) =>
        c.kind === "bezier" && this.editor.selectionOwners.has(c.id)
          ? [
              { curve: c, key: "c1" as const },
              { curve: c, key: "c2" as const },
            ]
          : [],
      ) ?? []
    );
  }
  private start = (event: PointerEvent): void => {
    const e = this.editor,
      sketch = e.sketch;
    if (event.button !== 0 || !sketch || e.blocked || e.isDragging) return;
    const p = { x: event.clientX, y: event.clientY };
    const hit = this.handles().find(
      (h) => distance(e.world.projectLocal(sketch.plane, h.curve[h.key]), p) < 9,
    );
    if (!hit) return;
    const lease = e.interactions.acquire("bezier", () => this.cancel());
    if (!lease) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.session = {
      ...hit,
      sketch,
      lease,
      solve: new GestureSolve(e, lease),
      pointer: event.pointerId,
    };
    lease.capture(e.world.canvas, event.pointerId);
    this.move(event);
  };
  private move = (event: PointerEvent): void => {
    const s = this.session,
      e = this.editor;
    if (!s || s.pointer !== event.pointerId || s.lease.phase !== "editing") return;
    event.stopImmediatePropagation();
    const p = e.world.pointAt(s.sketch.plane, event.clientX, event.clientY);
    if (!p) return;
    const anchor = s.key === "c1" ? s.curve.a : s.curve.b;
    const point = event.shiftKey
      ? penDirection(anchor, p, e.gridSnap ? e.world.spacing : 0)
      : snapped(e, p, new Set([s.curve.id]), false);
    if (event.shiftKey) e.snap = { ...point, label: "45°" };
    const end = s.key === "c1" ? "a" : "b";
    const sketch = event.altKey
      ? {
          ...s.sketch,
          constraints: s.sketch.constraints.filter(
            (c) =>
              c.kind !== "tangent" ||
              !(
                (c.a === s.curve.id && c.junction?.aEnd === end) ||
                (c.b === s.curve.id && c.junction?.bEnd === end)
              ),
          ),
        }
      : s.sketch;
    s.solve.update(editBezierHandle(sketch, s.curve.id, s.key, point));
  };
  private release = (event: PointerEvent): void => {
    const s = this.session;
    if (!s || s.pointer !== event.pointerId) return;
    event.stopImmediatePropagation();
    this.move(event);
    s.lease.releaseCapture();
    void this.commit(s);
  };
  private async commit(s: Session): Promise<void> {
    if (!s.lease.wait()) return;
    const valid = await s.solve.flush();
    if (this.session !== s || !s.lease.close()) return;
    if (valid) await this.editor.accept();
    else await s.solve.cancel();
    this.finish(s);
  }
  private async cancel(): Promise<void> {
    const s = this.session;
    if (!s?.lease.close()) return;
    await s.solve.cancel();
    this.finish(s);
  }
  private finish(s: Session): void {
    this.session = null;
    this.editor.snap = null;
    s.lease.release();
  }
  private draw = (): void => {
    this.root.replaceChildren();
    const sketch = this.editor.sketch;
    if (!sketch) return;
    const bounds = this.editor.world.canvas.getBoundingClientRect();
    for (const { curve, key } of this.handles()) {
      const a = this.editor.world.projectLocal(sketch.plane, key === "c1" ? curve.a : curve.b);
      const b = this.editor.world.projectLocal(sketch.plane, curve[key]);
      const line = document.createElementNS(ns, "line");
      for (const [name, value] of Object.entries({
        x1: a.x - bounds.left,
        y1: a.y - bounds.top,
        x2: b.x - bounds.left,
        y2: b.y - bounds.top,
      }))
        line.setAttribute(name, String(value));
      line.setAttribute("stroke", "#337ac4");
      line.setAttribute("stroke-dasharray", "4 3");
      const handle = document.createElementNS(ns, "circle");
      handle.setAttribute("cx", String(b.x - bounds.left));
      handle.setAttribute("cy", String(b.y - bounds.top));
      handle.setAttribute("r", "5");
      handle.classList.add("edit-handle");
      handle.setAttribute("data-curve", curve.id);
      handle.setAttribute("data-handle", key);
      const title = document.createElementNS(ns, "title");
      title.textContent = "Drag tangent handle · Shift locks 45° · Option / Alt breaks tangency";
      handle.append(title);
      this.root.append(line, handle);
    }
  };
  dispose(): void {
    void this.cancel();
    this.abort.abort();
    this.editor.world.changed.delete(this.draw);
    this.root.remove();
  }
}
