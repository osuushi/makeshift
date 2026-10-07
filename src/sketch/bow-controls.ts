import { placeFloatingPanel } from "../preferences/panel-placement.js";
import { numericFocus } from "../tools/menu-focus.js";
import type { InteractionLease } from "./active-interaction.js";
import { selectedBowCurves } from "./arc-edit.js";
import { arcCircle, bowRadius, bowThrough } from "./arc-geometry.js";
import type { Arc, Segment, Sketch } from "./document.js";
import type { SketchEditor } from "./editor.js";
import { GestureSolve } from "./gesture-solve.js";
import { jointBow } from "./joint-bow.js";
import { onModelKeydown } from "./model-keys.js";
import { pick } from "./picking.js";
import type { Point } from "./planes.js";
import { distance, midpoint } from "./point-math.js";
import type { SelectionTarget } from "./selection-target.js";

type Session = {
  sketch: Sketch;
  source: Segment | Arc;
  sources: (Segment | Arc)[];
  curve: Segment | Arc;
  side: number;
  solve: GestureSolve;
  selection: readonly SelectionTarget[];
  start: Point;
  pointer: number;
  moved: boolean;
  valid: boolean;
};
export class BowControls {
  private root = document.createElement("div");
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
    this.root.className = "bow-control";
    this.root.hidden = true;
    this.input.type = "text";
    this.input.inputMode = "decimal";
    this.input.setAttribute("aria-label", "Bow radius");
    this.root.append(this.input);
    overlay.append(this.root);
    const options = { signal: this.abort.signal, capture: true };
    const canvas = editor.world.canvas;
    canvas.addEventListener("pointerdown", this.start, options);
    canvas.addEventListener("pointermove", this.move, options);
    canvas.addEventListener("pointerup", this.release, options);
    canvas.addEventListener("pointercancel", () => void this.cancel(), options);
    this.input.addEventListener(
      "input",
      () => {
        const s = this.session;
        if (!s) return;
        this.preview(() => bowRadius(s.curve, Number(this.input.value), s.side));
      },
      options,
    );
    onModelKeydown((event) => {
      if (!this.session) return;
      event.stopImmediatePropagation();
      if (event.key === "Escape" || event.key === "Enter") {
        event.preventDefault();
        if (event.key === "Escape") void this.cancel();
        else void this.commit();
      }
    }, options);
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (!this.session || this.root.contains(event.target as Node)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        void this.cancel();
      },
      options,
    );
    editor.world.changed.add(this.update);
  }
  private start = (event: PointerEvent): void => {
    const sources = selectedBowCurves(this.editor),
      sketch = this.editor.sketch;
    if (
      event.button !== 0 ||
      this.session ||
      this.editor.blocked ||
      this.editor.isDragging ||
      !sources.length ||
      (sources.length === 1 && !sketch?.groups.some((g) => g.members.includes(sources[0].id))) ||
      !sketch
    )
      return;
    const hit = pick(this.editor, { x: event.clientX, y: event.clientY });
    if (hit?.kind !== "bow") return;
    const source = sources.find((c) => c.id === hit.curve);
    if (!source) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const interaction = this.editor.interactions.acquire("bow", () => this.cancel());
    if (!interaction) return;
    this.interaction = interaction;
    this.session = {
      sketch,
      source,
      sources,
      curve: source,
      side: hit.side,
      solve: new GestureSolve(this.editor, interaction),
      selection: this.editor.selected.targets,
      start: { x: event.clientX, y: event.clientY },
      pointer: event.pointerId,
      moved: false,
      valid: false,
    };
    this.editor.select([]);
    interaction.capture(this.editor.world.canvas, event.pointerId);
    this.preview(() => bowThrough(source, hit.point));
  };
  private preview(make: () => Segment | Arc): void {
    const s = this.session;
    if (!s || this.closing) return;
    try {
      const curve = make(),
        result = jointBow(s.sketch, s.sources, curve);
      s.curve = curve;
      s.valid = true;
      s.solve.update(result);
      this.editor.message = "";
      if (curve.kind === "arc" && !numericFocus(this.input))
        this.input.value = String(Number(arcCircle(curve).radius.toFixed(4)));
    } catch (error) {
      s.valid = false;
      s.solve.invalidate();
      this.editor.message = error instanceof Error ? error.message : String(error);
    }
    this.editor.refresh();
  }
  private move = (event: PointerEvent): void => {
    const s = this.session,
      canvas = this.editor.world.canvas;
    if (!s || s.pointer !== event.pointerId || !canvas.hasPointerCapture(event.pointerId)) return;
    event.stopImmediatePropagation();
    s.moved ||= distance(s.start, { x: event.clientX, y: event.clientY }) > 3;
    if (!s.moved) return;
    const point = this.editor.world.pointAt(s.sketch.plane, event.clientX, event.clientY);
    if (point) this.preview(() => bowThrough(s.source, point));
  };
  private release = (event: PointerEvent): void => {
    const s = this.session;
    if (!s || s.pointer !== event.pointerId) return;
    event.stopImmediatePropagation();
    this.move(event);
    this.interaction?.releaseCapture();
    if (s.moved) void this.commit();
    else {
      this.input.focus();
      this.input.select();
    }
  };
  private async commit(): Promise<void> {
    const s = this.session,
      interaction = this.interaction;
    if (!s || !interaction?.wait()) return;
    const valid = await s.solve.flush();
    if (this.session !== s || interaction.phase !== "waiting") return;
    if (!s.valid || !valid) {
      interaction.resume();
      this.editor.refresh();
      return;
    }
    if (!interaction.close()) return;
    if (await this.editor.accept()) this.editor.select(s.sources.map((c) => c.id));
    else this.editor.selectTargets(s.selection);
    this.finish();
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
    const s = this.session;
    this.root.hidden = !s;
    if (!s) return;
    const p = this.editor.world.projectLocal(s.sketch.plane, midpoint(s.source.a, s.source.b));
    const bounds = this.editor.world.canvas.getBoundingClientRect();
    this.root.style.left = `${Math.max(12, Math.min(bounds.width - 260, p.x - bounds.left + 30))}px`;
    this.root.style.top = `${Math.max(70, Math.min(bounds.height - 100, p.y - bounds.top + 35))}px`;
    if (!this.root.hidden) placeFloatingPanel(this.root);
    this.input.setAttribute("aria-invalid", String(!s.valid));
  };
  dispose(): void {
    void this.cancel();
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.root.remove();
  }
}
