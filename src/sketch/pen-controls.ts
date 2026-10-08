import { toolCatalog } from "../tools/catalog.js";
import type { InteractionLease } from "./active-interaction.js";
import { attachmentSnap } from "./creation-links.js";
import { emptySketch, newId, type Sketch, withSketch } from "./document.js";
import type { SketchEditor } from "./editor.js";
import { onModelKeydown } from "./model-keys.js";
import { replayPointerModifiers } from "./modifier-pointer.js";
import { type PenAnchor, penDirection, penHandles, penSegment } from "./pen-geometry.js";
import { drawPen } from "./pen-preview.js";
import type { Point } from "./planes.js";
import { distance } from "./point-math.js";
import { snapped } from "./snapping.js";

type Press = {
  pointer: number;
  screen: Point;
  anchor: PenAnchor;
  id: string;
  closing: boolean;
  adjusting: boolean;
  moved: boolean;
};

export class PenControls {
  private readonly abort = new AbortController();
  private readonly root = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  private lease: InteractionLease | null = null;
  private sketch: Sketch | null = null;
  private first: PenAnchor | null = null;
  private last: PenAnchor | null = null;
  private press: Press | null = null;
  private preview: PenAnchor | null = null;
  private finishRequested = false;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.root.classList.add("handles");
    this.root.setAttribute("aria-label", "Pen anchors and tangent handles");
    overlay.append(this.root);
    const options = { signal: this.abort.signal, capture: true };
    const canvas = editor.world.canvas;
    canvas.addEventListener("pointerdown", this.start, options);
    canvas.addEventListener("pointermove", this.move, options);
    canvas.addEventListener("pointerup", this.release, options);
    canvas.addEventListener("pointercancel", () => void this.cancel(), options);
    canvas.addEventListener(
      "dblclick",
      (event) => {
        if (editor.tool !== "pen") return;
        event.stopImmediatePropagation();
        this.requestFinish();
      },
      options,
    );
    replayPointerModifiers(this.abort.signal, () => !!this.lease, this.move);
    onModelKeydown(
      (event) => {
        if (event.defaultPrevented || editor.tool !== "pen" || event.key !== "Enter") return;
        if (
          event.target instanceof Element &&
          event.target.closest("input, textarea, [contenteditable]")
        )
          return;
        event.preventDefault();
        this.requestFinish();
      },
      { signal: this.abort.signal },
    );
    editor.world.changed.add(this.draw);
  }
  private requestFinish(): void {
    if (!this.lease || this.lease.captured) return;
    this.finishRequested = true;
    if (!this.press) void this.cancel();
  }
  private anchor(event: PointerEvent): PenAnchor | null {
    const e = this.editor;
    const plane = this.sketch?.plane ?? e.world.activeFrame;
    if (!plane) return null;
    const point = e.world.pointAt(plane, event.clientX, event.clientY);
    if (!point) return null;
    const placement = snapped(e, point, new Set(), event.shiftKey);
    const constrained =
      event.shiftKey && this.last
        ? penDirection(this.last.point, placement, e.gridSnap ? e.world.spacing : 0)
        : placement;
    if (event.shiftKey && this.last) e.snap = { ...constrained, label: "45°" };
    return {
      point: constrained,
      incoming: null,
      outgoing: null,
      smooth: false,
      attached: !event.shiftKey && attachmentSnap(e.snap?.label),
    };
  }
  private start = (event: PointerEvent): void => {
    const e = this.editor;
    if (
      e.tool !== "pen" ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      !e.world.active ||
      e.world.cameraTransitioning ||
      e.blocked ||
      e.isDragging ||
      toolCatalog(e).switching
    )
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    e.world.canvas.focus();
    if (!this.lease) {
      const plane = e.world.activeFrame;
      if (!plane) return;
      this.lease = e.interactions.acquire(
        "pen",
        this.cancel,
        async () => {
          await this.cancel();
          return true;
        },
        { navigation: "when-released", documentHistory: "cancel-preview" },
      );
      if (!this.lease) return;
      this.sketch = e.sketch ?? emptySketch(plane);
      if (e.world.workspace?.sketchId)
        this.sketch = { ...this.sketch, id: e.world.workspace.sketchId };
    }
    const anchor = this.anchor(event);
    const sketch = this.sketch;
    if (!anchor || !sketch) return;
    const screen = { x: event.clientX, y: event.clientY };
    const near = (a: PenAnchor | null) =>
      a && distance(e.world.projectLocal(sketch.plane, a.point), screen) < 8;
    const adjusting = !!near(this.last);
    const closing = !event.shiftKey && !adjusting && !!this.first?.endpoint && !!near(this.first);
    this.press = {
      pointer: event.pointerId,
      screen,
      anchor:
        closing && this.first
          ? { ...this.first }
          : adjusting && this.last
            ? { ...this.last }
            : anchor,
      id: newId(),
      closing,
      adjusting,
      moved: false,
    };
    this.lease.capture(e.world.canvas, event.pointerId);
    e.hover = null;
    this.move(event);
  };
  private move = (event: PointerEvent): void => {
    const e = this.editor,
      s = this.sketch,
      p = this.press;
    if (e.tool !== "pen" || !s || !this.lease || this.lease.phase !== "editing") return;
    event.stopImmediatePropagation();
    if (!p) {
      this.preview = this.anchor(event);
      this.show();
      return;
    }
    if (event.pointerId !== p.pointer) return;
    p.moved ||= distance(p.screen, { x: event.clientX, y: event.clientY }) > 3;
    if (p.moved) {
      const raw = e.world.pointAt(s.plane, event.clientX, event.clientY);
      if (!raw) return;
      const handle = event.shiftKey
        ? penDirection(p.anchor.point, raw, e.gridSnap ? e.world.spacing : 0)
        : snapped(e, raw, new Set(), false);
      if (event.shiftKey) e.snap = { ...handle, label: "45°" };
      const shaped = penHandles(p.anchor, handle, event.altKey);
      p.anchor = p.adjusting ? { ...shaped, incoming: p.anchor.incoming, smooth: false } : shaped;
    } else if (p.adjusting) p.anchor = { ...p.anchor, outgoing: null, smooth: false };
    this.preview = p.anchor;
    this.show();
  };
  private show(): void {
    const s = this.sketch,
      end = this.preview;
    if (!s || !this.lease) return;
    if (this.last && end && !this.press?.adjusting && distance(this.last.point, end.point) > 1e-8) {
      const preview = penSegment(s, this.last, end, this.press?.id ?? "pen-preview");
      this.lease.show(withSketch(this.editor.store.data, preview));
    } else this.lease.show(null);
    this.editor.refresh();
  }
  private release = (event: PointerEvent): void => {
    const p = this.press;
    if (!p || p.pointer !== event.pointerId || !this.lease || this.lease.phase !== "editing")
      return;
    event.stopImmediatePropagation();
    this.move(event);
    this.lease.releaseCapture();
    void this.commit(p);
  };
  private async commit(p: Press): Promise<void> {
    const lease = this.lease,
      s = this.sketch;
    if (!lease || !s || !lease.wait()) return;
    let accepted = false;
    if (!this.last || p.adjusting) {
      this.last = p.anchor;
      if (!this.first?.endpoint) this.first = p.anchor;
    } else if (distance(this.last.point, p.anchor.point) > 1e-8) {
      try {
        const candidate = penSegment(s, this.last, p.anchor, p.id);
        if (await this.editor.editSketch(candidate, { kind: "direct" }, lease)) {
          accepted = true;
          this.sketch = this.editor.store.data.sketches.find((item) => item.id === s.id) ?? null;
          if (this.first) this.first.endpoint ??= { curve: p.id, end: "a" };
          this.last = { ...p.anchor, endpoint: { curve: p.id, end: "b" } };
          this.editor.select([p.id]);
        }
      } catch (error) {
        this.editor.message = String(error);
      }
    }
    if (this.lease !== lease) return;
    this.press = null;
    this.preview = null;
    lease.show(null);
    lease.resume();
    if ((p.closing && accepted) || this.finishRequested) await this.cancel();
    this.editor.refresh();
  }
  private cancel = async (): Promise<void> => {
    const lease = this.lease;
    if (!lease?.close()) return;
    this.lease = null;
    this.sketch = null;
    this.first = this.last = this.preview = null;
    this.press = null;
    this.finishRequested = false;
    this.editor.snap = null;
    lease.release();
  };
  private draw = (): void => {
    drawPen(this.root, this.editor, this.sketch?.plane, [this.first, this.last, this.preview]);
  };
  dispose(): void {
    void this.cancel();
    this.abort.abort();
    this.editor.world.changed.delete(this.draw);
    this.root.remove();
  }
}
