import { curveDistance, displayPoints } from "./curve-geometry.js";
import type { SketchEditor } from "./editor.js";
import type { Point } from "./planes.js";
import { distance } from "./point-math.js";
import { trimBrushSpans, trimHighlights, uniqueTrimSpans } from "./trim-brush.js";
import { TrimBrushControls } from "./trim-brush-controls.js";
import { trimChain } from "./trim-chain.js";
import { spanCurve, type TrimSpan, trimAt, trimSpanLength } from "./trim-geometry.js";
import { TrimGesture } from "./trim-gesture.js";

export class TrimControls {
  private svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  private mark = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  private circle = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  private chain = document.createElementNS("http://www.w3.org/2000/svg", "g");
  private abort = new AbortController();
  private brush: TrimBrushControls;
  private pointer: Point | null = null;
  private start: Point | null = null;
  private spans: TrimSpan[] = [];
  private stroke: { gesture: TrimGesture; last: Point; spans: TrimSpan[]; id: number } | null =
    null;
  private intersectionsOnly = false;
  private option = false;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.svg.classList.add("trim-overlay");
    this.mark.classList.add("trim-span");
    this.circle.classList.add("trim-brush-circle");
    this.svg.append(this.mark, this.chain, this.circle);
    this.brush = new TrimBrushControls(this.update, this.abort.signal);
    overlay.append(this.svg, this.brush.root);
    const options = { signal: this.abort.signal },
      canvas = editor.world.canvas;
    canvas.addEventListener("pointermove", this.move, options);
    canvas.addEventListener("pointerdown", this.down, options);
    canvas.addEventListener("pointerup", this.up, options);
    canvas.addEventListener(
      "pointercancel",
      () => {
        this.start = null;
        if (this.stroke) editor.interactions.requestCancel();
      },
      options,
    );
    canvas.addEventListener(
      "pointerleave",
      () => {
        if (!this.stroke) this.clearPointer();
      },
      options,
    );
    window.addEventListener("keydown", this.modifiers, options);
    window.addEventListener("keyup", this.modifiers, options);
    window.addEventListener("blur", this.blur, options);
    editor.world.changed.add(this.update);
    this.update();
  }
  private move = (event: PointerEvent): void => {
    if (this.editor.tool !== "trim" || this.editor.blocked) return;
    if (event.buttons && !this.stroke) return;
    if (this.stroke && event.pointerId !== this.stroke.id) return;
    this.intersectionsOnly = event.shiftKey;
    this.option = event.altKey;
    this.pointer = { x: event.clientX, y: event.clientY };
    this.update();
  };
  private down = (event: PointerEvent): void => {
    const editor = this.editor,
      sketch = editor.sketch;
    if (
      event.button !== 0 ||
      editor.tool !== "trim" ||
      editor.blocked ||
      editor.interactions.current ||
      editor.world.cameraTransitioning ||
      !editor.world.active
    )
      return;
    event.preventDefault();
    editor.world.canvas.focus();
    this.start = this.pointer = { x: event.clientX, y: event.clientY };
    this.intersectionsOnly = event.shiftKey;
    this.option = event.altKey;
    if (this.option && sketch) {
      const point = editor.world.pointAt(sketch.plane, event.clientX, event.clientY);
      if (!point) return;
      const gesture = new TrimGesture(editor, sketch, this.clearPointer);
      if (!gesture.interaction) return;
      this.stroke = { gesture, last: point, spans: [], id: event.pointerId };
      gesture.interaction.capture(editor.world.canvas, event.pointerId);
    }
    this.update();
  };
  private up = (event: PointerEvent): void => {
    const start = this.start;
    this.start = null;
    if (!start || event.button !== 0 || this.editor.blocked || this.editor.tool !== "trim") return;
    this.move(event);
    const stroke = this.stroke;
    if (stroke) {
      if (event.pointerId === stroke.id) void stroke.gesture.finish(stroke.spans);
      return;
    }
    if (distance(start, { x: event.clientX, y: event.clientY }) > 4) return;
    const spans = this.option ? this.brushTargets() : (this.targets()[0] ?? []),
      sketch = this.editor.sketch;
    if (spans.length && sketch) {
      const gesture = new TrimGesture(this.editor, sketch, this.clearPointer);
      void gesture.finish(spans);
    }
  };
  private modifiers = (event: KeyboardEvent): void => {
    const changed = this.intersectionsOnly !== event.shiftKey || this.option !== event.altKey;
    this.intersectionsOnly = event.shiftKey;
    this.option = event.altKey;
    const input =
      event.target instanceof Element &&
      event.target.closest(
        "input, textarea, [contenteditable], .agent-dock, .preview-pane, dialog[open]",
      );
    const resized =
      event.type === "keydown" &&
      !input &&
      this.editor.tool === "trim" &&
      this.option &&
      !this.editor.blocked &&
      this.brush.resize(event);
    if (changed || resized) this.update();
  };
  private brushTargets(): TrimSpan[] {
    const sketch = this.stroke?.gesture.sketch ?? this.editor.sketch,
      p = this.pointer;
    if (!sketch || !p) return [];
    const point = this.editor.world.pointAt(sketch.plane, p.x, p.y);
    if (!point) return [];
    const spans = trimBrushSpans(
      sketch.curves,
      this.stroke?.last ?? point,
      point,
      this.brush.diameter / 2,
      this.intersectionsOnly,
    );
    if (this.stroke) {
      this.stroke.last = point;
      this.stroke.spans = uniqueTrimSpans([...this.stroke.spans, ...spans]);
      return this.stroke.spans;
    }
    return spans;
  }
  private targets(): TrimSpan[][] {
    const sketch = this.editor.sketch,
      p = this.pointer;
    if (!sketch || !p || !this.editor.world.active) return [];
    const point = this.editor.world.pointAt(sketch.plane, p.x, p.y);
    if (!point) return [];
    const scale = this.editor.world.canvas.clientHeight / this.editor.world.height;
    const near = sketch.curves
      .map((curve) => ({ curve, d: curveDistance(curve, point) * scale }))
      .filter((c) => c.d <= 8)
      .sort((a, b) => a.d - b.d);
    return near
      .filter((c) => c.d <= near[0].d + 1)
      .map((c) => trimAt(c.curve, sketch.curves, point, this.intersectionsOnly))
      .map((span) => (this.intersectionsOnly ? trimChain(span, sketch.curves) : [span]))
      .sort(
        (a, b) =>
          a.reduce((sum, s) => sum + trimSpanLength(s), 0) -
          b.reduce((sum, s) => sum + trimSpanLength(s), 0),
      );
  }
  private clearPointer = (): void => {
    this.stroke = null;
    this.start = null;
    this.spans = [];
    this.pointer = null;
    for (const input of this.brush.root.querySelectorAll("input"))
      input.disabled = this.editor.blocked;
    this.editor.world.canvas.style.cursor = "crosshair";
    this.render();
  };
  private blur = (): void => {
    this.option = this.intersectionsOnly = false;
    if (this.stroke?.gesture.interaction?.captured) this.editor.interactions.requestCancel();
    else if (!this.stroke) this.clearPointer();
    this.render();
  };
  private render(): void {
    this.brush.root.hidden =
      this.editor.tool !== "trim" || !this.editor.world.active || !this.option;
    const r = this.editor.world.canvas.getBoundingClientRect(),
      sketch = this.stroke?.gesture.sketch ?? this.editor.sketch,
      frame = sketch?.plane ?? this.editor.world.activeFrame;
    this.svg.setAttribute("viewBox", `0 0 ${r.width} ${r.height}`);
    const project = (p: Point) => {
      if (!frame) return "";
      const s = this.editor.world.projectLocal(frame, p);
      return `${s.x - r.left},${s.y - r.top}`;
    };
    const marks = this.spans.map((span, i) => {
      const mark =
        i === 0 ? this.mark : document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      mark.classList.add("trim-span");
      mark.dataset.curve = span.curve.id;
      mark.setAttribute(
        "points",
        !sketch
          ? ""
          : displayPoints(spanCurve(span), this.editor.world.height / r.height)
              .map(project)
              .join(" "),
      );
      return mark;
    });
    this.chain.replaceChildren(...marks.slice(1));
    if (!marks.length) {
      this.mark.setAttribute("points", "");
      this.mark.dataset.curve = "";
    }
    const p = this.pointer,
      center = frame && p && this.editor.world.pointAt(frame, p.x, p.y),
      visible = !!center && (this.option || !!this.stroke) && !this.editor.blocked;
    this.circle.style.display = visible ? "" : "none";
    this.circle.setAttribute(
      "points",
      visible
        ? displayPoints(
            {
              id: "",
              kind: "circle",
              center,
              radius: this.brush.diameter / 2,
              construction: false,
            },
            this.editor.world.height / r.height,
          )
            .map(project)
            .join(" ")
        : "",
    );
    this.circle.dataset.diameter = String(this.brush.diameter);
  }
  private update = (): void => {
    const active = this.editor.tool === "trim" && !!this.editor.world.active;
    this.svg.style.display = active ? "" : "none";
    for (const input of this.brush.root.querySelectorAll("input"))
      input.disabled = this.editor.blocked || !!this.stroke;
    if (!active) {
      this.clearPointer();
      return;
    }
    const sketch = this.stroke?.gesture.sketch ?? this.editor.sketch,
      spans = this.editor.blocked
        ? []
        : this.option || this.stroke
          ? this.brushTargets()
          : (this.targets()[0] ?? []);
    this.spans = sketch ? trimHighlights(spans, sketch.curves) : [];
    this.editor.world.canvas.style.cursor = this.option || this.stroke ? "none" : "crosshair";
    this.render();
  };
  dispose(): void {
    if (this.stroke) this.editor.interactions.requestCancel();
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.svg.remove();
    this.brush.root.remove();
  }
}
