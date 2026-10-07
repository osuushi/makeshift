import { placeFloatingPanel } from "../preferences/panel-placement.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";
import { numericFocus } from "../tools/menu-focus.js";
import type { InteractionLease } from "./active-interaction.js";
import { newId, type Sketch } from "./document.js";
import type { SketchEditor } from "./editor.js";
import { createFillet } from "./fillet-edit.js";
import type { FilletCorner } from "./fillet-geometry.js";
import { FilletGuide } from "./fillet-guide.js";
import { filletRadiusAt } from "./fillet-radius.js";
import { selectedFilletCorner } from "./fillet-selection.js";
import { GestureSolve } from "./gesture-solve.js";
import { onModelKeydown } from "./model-keys.js";
import type { Point } from "./planes.js";
import { distance } from "./point-math.js";

import type { SelectionTarget } from "./selection-target.js";

type Session = {
  sketch: Sketch;
  corner: FilletCorner;
  id: string;
  selection: readonly SelectionTarget[];
  radius: number;
  solve: GestureSolve;
  start: Point;
  pointer: number;
  moved: boolean;
  valid: boolean;
};
export class FilletControls {
  private disposeTool: () => void;
  private root = document.createElement("div");
  private guide = new FilletGuide();
  private handle = this.guide.hit;
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
      id: "sketch-fillet",
      finishEdit: true,
      label: "Fillet sketch corner",
      category: "Sketch",
      aliases: ["round sketch corner"],
      reason: () =>
        idleReason(editor) ??
        (this.corner() ? null : "Select two sketch edges meeting at a corner"),
      run: () => {
        const rect = this.handle.getBoundingClientRect();
        this.begin({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
        if (this.session) {
          this.input.focus();
          this.input.select();
        }
      },
    });
    this.root.className = "fillet-control";
    this.input.type = "text";
    this.input.inputMode = "decimal";
    this.input.setAttribute("aria-label", "Fillet radius");
    this.root.append(this.input);
    overlay.append(this.guide.element, this.root);
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
        if (!this.session || this.closing || this.root.contains(event.target as Node)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        void this.cancel();
      },
      { ...options, capture: true },
    );
    editor.world.changed.add(this.update);
    this.update();
  }
  private corner(): FilletCorner | null {
    return selectedFilletCorner(this.editor);
  }

  private start = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    this.begin({ x: event.clientX, y: event.clientY }, event.pointerId);
  };
  private begin(point: Point, pointer?: number): void {
    const corner = this.corner(),
      sketch = this.editor.sketch;
    if (this.session || this.editor.blocked || !corner || !sketch) return;
    const interaction = this.editor.interactions.acquire(
      "fillet",
      () => this.cancel(),
      () => this.commit(),
      { navigation: "when-released", documentHistory: "cancel-preview" },
    );
    if (!interaction) return;
    this.interaction = interaction;
    this.session = {
      sketch,
      corner,
      id: newId(),
      selection: this.editor.selected.targets,
      radius: this.guide.radius,
      solve: new GestureSolve(this.editor, interaction),
      start: { x: point.x, y: point.y },
      pointer: pointer ?? -1,
      moved: false,
      valid: false,
    };
    this.editor.select([]);
    if (pointer !== undefined) interaction.capture(this.handle, pointer);
    this.preview(this.session.radius);
  }
  private preview(radius: number): void {
    const session = this.session;
    if (!session || this.closing) return;
    try {
      const result = createFillet(session.sketch, session.corner, radius, session.id);
      session.valid = true;
      session.radius = radius;
      session.solve.update(result.sketch);
      this.editor.message = "";
      this.input.removeAttribute("aria-invalid");
      if (!numericFocus(this.input)) this.input.value = String(Number(radius.toFixed(4)));
    } catch (error) {
      session.valid = false;
      session.solve.invalidate();
      this.input.setAttribute("aria-invalid", "true");
      this.editor.message = error instanceof Error ? error.message : String(error);
    }
    this.editor.refresh();
  }
  private move = (event: PointerEvent): void => {
    const s = this.session;
    if (!s || s.pointer !== event.pointerId || !this.handle.hasPointerCapture(event.pointerId))
      return;
    s.moved ||= distance(s.start, { x: event.clientX, y: event.clientY }) > 3;
    if (!s.moved) return;
    const point = this.editor.world.pointAt(s.sketch.plane, event.clientX, event.clientY);
    if (point)
      this.preview(
        filletRadiusAt(s.corner, point, this.editor.gridSnap ? this.editor.world.spacing : 0),
      );
  };
  private release = (event: PointerEvent): void => {
    const s = this.session;
    if (!s || s.pointer !== event.pointerId) return;
    this.move(event);
    this.interaction?.releaseCapture();
    void this.commit();
  };
  private async commit(): Promise<boolean> {
    const s = this.session,
      interaction = this.interaction;
    if (!s || !interaction || interaction.captured || !interaction.wait()) return false;
    const valid = await s.solve.flush();
    if (this.session !== s || interaction.phase !== "waiting") return false;
    if (!s.valid || !valid) {
      if (s.pointer >= 0) {
        await this.cancel();
        return false;
      }
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
    this.editor.select([s.id]);
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
    const c = this.session?.corner ?? this.corner(),
      sketch = this.session?.sketch ?? this.editor.sketch;
    this.root.hidden = !this.session || !c || !sketch;
    this.guide.update(c, sketch, this.editor.world, this.session?.radius);
    if (!c || !sketch) return;
    const p = this.editor.world.projectLocal(sketch.plane, c.point);
    const bounds = this.editor.world.canvas.getBoundingClientRect();
    this.root.style.left = `${Math.max(12, Math.min(bounds.width - 220, p.x - bounds.left + 24))}px`;
    this.root.style.top = `${Math.max(70, Math.min(bounds.height - 100, p.y - bounds.top + 28))}px`;
    if (!this.root.hidden) placeFloatingPanel(this.root);
    this.input.hidden = !this.session;
    const disabled = this.closing || (!this.session && this.editor.blocked);
    this.handle.setAttribute("aria-disabled", String(disabled));
    this.handle.style.pointerEvents = disabled ? "none" : "";
  };
  dispose(): void {
    void this.cancel();
    this.disposeTool();
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.root.remove();
    this.guide.element.remove();
  }
}
