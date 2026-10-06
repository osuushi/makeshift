import { idleReason, toolCatalog } from "../tools/catalog.js";
import { numericFocus } from "../tools/menu-focus.js";
import type { InteractionLease } from "./active-interaction.js";
import { type Constraint, newId, type Sketch } from "./document.js";
import type { SketchEditor } from "./editor.js";
import { GestureSolve } from "./gesture-solve.js";
import { onModelKeydown } from "./model-keys.js";
import { offsetDistance } from "./offset-geometry.js";
import { selectedOffsetCurves } from "./offset-selection.js";
import { type OffsetTarget, offsetLinks, offsetPreview, prepareOffset } from "./offset-target.js";
import { placeOffsetWidget } from "./offset-widget.js";
import type { Point } from "./planes.js";
import { distance } from "./point-math.js";
import type { SelectionTarget } from "./selection-target.js";

type Session = {
  sketch: Sketch;
  target: OffsetTarget;
  ids: string[];
  links: Constraint[];
  selection: readonly SelectionTarget[];
  solve: GestureSolve;
  start: Point;
  screen: Point;
  pointer: number;
  moved: boolean;
  valid: boolean;
  amount: number;
};
export class OffsetControls {
  private disposeTool: () => void;
  private root = document.createElement("div");
  private handle = document.createElement("button");
  private input = document.createElement("input");
  private abort = new AbortController();
  private session: Session | null = null;
  private interaction: InteractionLease | null = null;
  private get closing(): boolean {
    return !!this.interaction && this.interaction.phase !== "editing";
  }
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.disposeTool = toolCatalog(editor).register({
      id: "sketch-offset",
      finishEdit: true,
      label: "Offset sketch curves",
      category: "Sketch",
      aliases: ["offset sketch", "parallel curve"],
      reason: () =>
        idleReason(editor) ??
        (selectedOffsetCurves(this.editor)
          ? null
          : editor.sketch?.curves.some(
                (c) => c.kind === "bezier" && editor.selectionOwners.has(c.id),
              )
            ? "Select one closed loop to offset cubic curves"
            : "Select a sketch edge or closed loop"),
      run: () => {
        const rect = this.handle.getBoundingClientRect();
        this.begin({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
        if (this.session) {
          this.input.focus();
          this.input.select();
        }
      },
    });
    this.root.className = "offset-control";
    this.handle.type = "button";
    this.handle.className = "sketch-offset-handle orientable-handle";
    this.handle.setAttribute("aria-label", "Offset edge");
    this.handle.dataset.action = "offset";
    this.input.type = "text";
    this.input.inputMode = "decimal";
    this.input.setAttribute("aria-label", "Offset distance");
    this.root.append(this.handle, this.input);
    overlay.append(this.root);
    const options = { signal: this.abort.signal };
    this.handle.addEventListener("pointerdown", this.start, options);
    this.handle.addEventListener("pointermove", this.move, options);
    this.handle.addEventListener("pointerup", this.release, options);
    this.handle.addEventListener("pointercancel", () => void this.cancel(), options);
    this.input.addEventListener("input", () => this.preview(Number(this.input.value)), options);
    onModelKeydown(
      (event) => {
        if (!this.session) return;
        if (event.key !== "Escape" && event.key !== "Enter") return;
        event.stopImmediatePropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          void this.cancel();
        }
        if (event.key === "Enter") {
          event.preventDefault();
          void this.commit();
        }
      },
      { ...options, capture: true },
    );
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (!this.session || this.root.contains(event.target as Node)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        void this.cancel();
      },
      { ...options, capture: true },
    );
    editor.world.changed.add(this.update);
    this.update();
  }
  private start = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    this.begin({ x: event.clientX, y: event.clientY }, event.pointerId);
  };
  private begin(point: Point, pointer?: number): void {
    const curves = selectedOffsetCurves(this.editor),
      sketch = this.editor.sketch;
    if (this.session || this.editor.blocked || this.editor.isDragging || !curves || !sketch) return;
    let target: OffsetTarget;
    try {
      target = prepareOffset(curves);
    } catch (error) {
      this.editor.message = error instanceof Error ? error.message : String(error);
      this.editor.refresh();
      return;
    }
    const start = this.editor.world.pointAt(sketch.plane, point.x, point.y);
    if (!start) return;
    const ids = curves.map(() => newId());
    const interaction = this.editor.interactions.acquire(
      "offset",
      () => this.cancel(),
      () => this.commit(),
      { navigation: "when-released", documentHistory: "cancel-preview" },
    );
    if (!interaction) return;
    this.interaction = interaction;
    this.session = {
      sketch,
      target,
      ids,
      links: offsetLinks(sketch, target, ids),
      selection: this.editor.selected.targets,
      solve: new GestureSolve(this.editor, interaction),
      start,
      screen: { x: point.x, y: point.y },
      pointer: pointer ?? -1,
      moved: false,
      valid: false,
      amount: this.editor.world.spacing,
    };
    this.editor.select([]);
    if (pointer !== undefined) interaction.capture(this.handle, pointer);
    this.preview(this.session.amount);
  }
  private preview(amount: number): void {
    const s = this.session;
    if (!s || this.closing) return;
    s.amount = amount;
    try {
      // A failed loop amount may need the native topology route, but a later
      // amount can still have an analytic join. Recheck it on each preview.
      if (s.target.loop) s.target.native = false;
      const sketch = offsetPreview(s.sketch, s.target, amount, s.ids, s.links);
      if (!sketch) {
        s.target.native = true;
        s.valid = true;
        s.solve.offset(
          s.sketch.id,
          [...new Set(s.selection.flatMap((t) => (t.kind === "curve" ? [t.curve] : [])))],
          amount,
        );
      } else {
        s.valid = true;
        s.solve.update(sketch);
      }
      this.editor.message = "";
      this.input.removeAttribute("aria-invalid");
    } catch (error) {
      s.valid = false;
      s.solve.invalidate();
      this.input.setAttribute("aria-invalid", "true");
      this.editor.message = error instanceof Error ? error.message : String(error);
    }
    if (!numericFocus(this.input)) this.input.value = String(Number(amount.toFixed(4)));
    this.editor.refresh();
  }
  private move = (event: PointerEvent): void => {
    const s = this.session;
    if (!s || s.pointer !== event.pointerId || !this.handle.hasPointerCapture(event.pointerId))
      return;
    s.moved ||= distance(s.screen, { x: event.clientX, y: event.clientY }) > 3;
    const point = this.editor.world.pointAt(s.sketch.plane, event.clientX, event.clientY);
    if (s.moved && point)
      this.preview(
        offsetDistance(
          s.target.curve,
          s.start,
          point,
          this.editor.gridSnap ? this.editor.world.spacing : 0,
        ) * s.target.direction,
      );
  };
  private release = (event: PointerEvent): void => {
    const s = this.session;
    if (!s || s.pointer !== event.pointerId) return;
    this.move(event);
    this.interaction?.releaseCapture();
    if (s.moved) void this.commit();
    else {
      this.input.focus();
      this.input.select();
    }
  };
  private async commit(): Promise<boolean> {
    const s = this.session,
      interaction = this.interaction;
    if (!s || !interaction || interaction.captured || !interaction.wait()) return false;
    const valid = await s.solve.flush();
    if (this.session !== s || interaction.phase !== "waiting") return false;
    if (!s.valid || !valid) {
      interaction.resume();
      this.editor.refresh();
      return false;
    }
    if (!interaction.close()) return false;
    if (!(await this.editor.accept())) {
      interaction.phase = "editing";
      this.editor.refresh();
      return false;
    }
    this.editor.select(
      s.target.native
        ? (this.editor.sketch?.curves
            .filter((c) => !s.sketch.curves.some((old) => old.id === c.id))
            .map((c) => c.id) ?? [])
        : s.ids,
    );
    this.finish();
    return true;
  }
  private async cancel(): Promise<void> {
    const s = this.session;
    if (!s || !this.interaction?.close()) return;
    await s.solve.cancel();
    this.editor.selectTargets(s.selection);
    this.finish();
  }
  private finish(): void {
    const interaction = this.interaction;
    this.session = null;
    this.interaction = null;
    interaction?.release();
  }
  private update = (): void => {
    const s = this.session,
      curves = selectedOffsetCurves(this.editor),
      sketch = s?.sketch ?? this.editor.sketch;
    this.root.hidden = (!s && (!curves || this.editor.moveMode)) || !sketch;
    if (!sketch || (!s && !curves)) return;
    let target = s?.target;
    if (!target && curves) {
      try {
        target = prepareOffset(curves);
      } catch {
        target = { curve: curves[0], direction: 1 };
      }
    }
    if (!target) return;
    const loop = !!s?.target.native || !!s?.target.loop || (curves?.length ?? 0) > 1;
    this.handle.title = `${loop ? "Offset loop" : "Offset edge"} · drag outward or click to type`;
    this.handle.setAttribute("aria-label", loop ? "Offset loop" : "Offset edge");
    placeOffsetWidget(this.editor, sketch, target, this.root, this.handle);
    const invalid = !!s && (!s.valid || (s.target.native && s.solve.settled && !s.solve.valid));
    this.handle.dataset.geometryInvalid = String(invalid);
    if (s?.target.native) this.input.setAttribute("aria-invalid", String(invalid));
    this.input.hidden = !s;
    this.handle.disabled = this.closing || (!s && this.editor.blocked);
  };
  dispose(): void {
    void this.cancel();
    this.disposeTool();
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.root.remove();
  }
}
