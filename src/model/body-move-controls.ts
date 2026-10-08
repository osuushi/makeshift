import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { Vector } from "../sketch/planes.js";
import { numericFocus } from "../tools/menu-focus.js";
import type { BodyTransform } from "./body.js";
import { selectedBodies } from "./body-actions.js";
import { bodySnap, dragFrame } from "./body-drag.js";
import { BodyGizmo } from "./body-gizmo.js";
import { BodyPivotDrag } from "./body-pivot-drag.js";
import { axes, bodyCenter, placedDocument } from "./body-placement.js";
import { GizmoInputs, type GizmoPointer } from "./gizmo-inputs.js";
import { reopenBodyTransform } from "./reopen-body-transform.js";
import { widgetPointerOffset } from "./widget-viewport.js";

type Session = {
  edit: BodyTransform;
  lease: InteractionLease;
  valid: boolean;
  value: number;
  axis: string;
  rotate: boolean;
  pivotOnly: boolean;
  explicitCopy: boolean;
  lastPreview: string | null;
};
export class BodyMoveControls {
  private gizmo: BodyGizmo;
  private pivotDrag: BodyPivotDrag;
  private snap = document.createElement("div");
  private abort = new AbortController();
  private pivot: Vector = [0, 0, 0];
  private pivotMode = false;
  private customPivot = false;
  private selection = "";
  private session: Session | null = null;
  private pointer: GizmoPointer | null = null;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.gizmo = new BodyGizmo(overlay, this.start);
    this.pivotDrag = new BodyPivotDrag(
      editor,
      this.gizmo.pivot,
      () => this.pivot,
      (point) => {
        this.customPivot = true;
        this.pivot = point;
        editor.refresh();
      },
      () => {
        this.pivotMode = !this.pivotMode;
        editor.refresh();
      },
    );
    this.snap.className = "body-snap";
    this.snap.hidden = true;
    overlay.append(this.snap);
    new GizmoInputs(editor, this.gizmo.input, this.abort.signal, {
      gesture: () =>
        this.pointer ? { pointer: this.pointer, rotate: this.session?.rotate ?? false } : null,
      active: () => !!this.session,
      viewportOnly: true,
      queue: (value) => this.preview(value),
      modifiers: (event) => {
        const s = this.session;
        if (s) s.edit.duplicate = !s.pivotOnly && (s.explicitCopy || event.altKey);
      },
      snap: (event, value) => this.snapValue(event, value),
      release: (moved) => {
        this.pointer = null;
        this.session?.lease.releaseCapture();
        if (moved) void this.commit();
        else {
          this.gizmo.input.focus();
          this.gizmo.input.select();
        }
      },
      finish: () => this.commit(),
      cancel: () => this.cancel(),
    });
    editor.world.changed.add(this.update);
    this.update();
  }
  enable(copy: boolean): void {
    if (
      this.editor.interactions.current ||
      this.editor.blocked ||
      !selectedBodies(this.editor, copy ? "duplicate" : "move").length
    )
      return;
    this.editor.modeling.setTool("move");
    this.pivotMode = false;
    if (copy) this.open(true);
    this.editor.refresh();
  }
  async reopen(edit: BodyTransform): Promise<void> {
    const parameters = reopenBodyTransform(edit);
    if (!parameters)
      throw new Error("This body transform cannot use the ordinary movement controls");
    this.editor.modeling.setTool("move");
    this.pivotMode = false;
    this.pivot = [...edit.pivot];
    this.customPivot = true;
    const session = this.open(edit.duplicate, edit);
    if (!session) throw new Error("Cannot restore body movement inputs");
    this.preview(parameters.value);
    session.lease.show(this.editor.store.candidate);
    this.gizmo.input.focus();
    this.gizmo.input.select();
  }
  private open(duplicate: boolean, restored?: BodyTransform): Session | null {
    const bodies = selectedBodies(this.editor, duplicate ? "duplicate" : "move");
    if (!bodies.length) return null;
    const lease = this.editor.interactions.acquire(
      "body-move",
      () => this.cancel(),
      async () => {
        if (!this.session?.valid) return false;
        await this.commit();
        return !this.session;
      },
      {
        navigation: "when-released",
      },
    );
    if (!lease) return null;
    this.gizmo.input.removeAttribute("aria-label");
    this.session = {
      lease,
      explicitCopy: duplicate,
      lastPreview: null,
      valid: true,
      value: 0,
      axis: "X",
      rotate: false,
      pivotOnly: this.pivotMode,
      edit: {
        ids: bodies.map((b) => b.id),
        pivot: [...this.pivot],
        axis: axes.X,
        translation: [0, 0, 0],
        angle: 0,
        duplicate,
      },
    };
    const session = this.session;
    if (restored) {
      const parameters = reopenBodyTransform(restored);
      if (!parameters) {
        this.cancel();
        return null;
      }
      session.edit = structuredClone(restored);
      session.value = parameters.value;
      session.axis = parameters.axis;
      session.edit.axis = axes[parameters.axis];
      session.rotate = parameters.rotate;
      this.gizmo.input.value = String(parameters.value);
      this.gizmo.input.setAttribute(
        "aria-label",
        `Body ${parameters.rotate ? "rotation" : "translation"} ${parameters.axis}`,
      );
    }
    lease.trackHistory(
      this.gizmo.root,
      () => ({
        value: session.value,
        axis: session.axis,
        rotate: session.rotate,
        duplicate: session.edit.duplicate,
      }),
      (state) => {
        session.axis = state.axis;
        session.rotate = state.rotate;
        session.edit.axis = axes[state.axis];
        session.edit.duplicate = state.duplicate;
        this.gizmo.input.setAttribute(
          "aria-label",
          `${session.pivotOnly ? "Pivot" : state.rotate ? "Body rotation" : "Body translation"} ${state.axis}`,
        );
        this.gizmo.input.value = String(state.value);
        this.preview(state.value);
      },
    );
    this.preview(session.value);
    return this.session;
  }
  private start = (event: PointerEvent, axis: string, rotate: boolean): void => {
    if (
      event.button ||
      this.editor.blocked ||
      this.pointer ||
      (this.session && !this.session.edit.duplicate)
    )
      return;
    const s = this.session ?? this.open(false);
    if (!s) return;
    s.edit.duplicate = !s.pivotOnly && (s.explicitCopy || event.altKey);
    s.axis = axis;
    s.rotate = rotate;
    s.edit.axis = axes[axis];
    if (event.pointerId !== -1)
      this.pointer = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        moved: false,
        frame: dragFrame(
          this.editor,
          this.pivot,
          axis,
          event.clientX,
          event.clientY,
          undefined,
          widgetPointerOffset(event.currentTarget),
        ),
      };
    this.gizmo.input.setAttribute(
      "aria-label",
      `${s.pivotOnly ? "Pivot" : rotate ? "Body rotation" : "Body translation"} ${axis}`,
    );
    if (event.pointerId !== -1) s.lease.capture(event.currentTarget as Element, event.pointerId);
    else {
      this.gizmo.input.focus();
      this.gizmo.input.select();
    }
    event.preventDefault();
    this.editor.refresh();
  };
  private preview(value: number): void {
    const s = this.session;
    if (s?.lease.phase !== "editing") return;
    const wasValid = s.valid;
    const previousValue = s.value;
    s.valid = Number.isFinite(value);
    s.value = value;
    let changed = wasValid !== s.valid || (s.pivotOnly && previousValue !== value);
    if (s.valid) {
      s.edit.translation = s.rotate ? [0, 0, 0] : (axes[s.axis].map((v) => v * value) as Vector);
      s.edit.angle = s.rotate ? value : 0;
      const previewKey = JSON.stringify(s.edit);
      if (!s.pivotOnly && previewKey !== s.lastPreview) {
        s.lease.show(placedDocument(this.editor.store.data, s.edit));
        s.lastPreview = previewKey;
        changed = true;
      }
    }
    if (!numericFocus(this.gizmo.input)) this.gizmo.input.value = String(Number(value.toFixed(4)));
    if (changed) this.editor.refresh();
  }
  private async commit(): Promise<void> {
    const s = this.session;
    if (!s?.valid || !s.lease.close()) return;
    s.lease.releaseCapture();
    this.pointer = null;
    if (s.pivotOnly) {
      this.customPivot = true;
      this.pivot = s.edit.pivot.map((v, i) => v + s.edit.translation[i]) as Vector;
    } else if (s.value !== 0 || s.edit.duplicate) {
      const before = new Set(this.editor.store.data.bodies?.map((b) => b.id));
      const ok = await this.editor.store.request({ kind: "transform-bodies", transform: s.edit });
      if (ok) {
        const ids = s.edit.duplicate
          ? (this.editor.store.data.bodies?.filter((b) => !before.has(b.id)).map((b) => b.id) ?? [])
          : s.edit.ids;
        this.editor.modeling.targets = ids.map((body) => ({ kind: "body", body }));
        this.selection = ids.slice().sort().join(",");
        this.pivot = s.edit.pivot.map((v, i) => v + s.edit.translation[i]) as Vector;
      }
    }
    this.session = null;
    s.lease.release();
    this.snap.hidden = true;
    this.editor.refresh();
  }
  private cancel(): void {
    const s = this.session;
    if (s && !s.lease.close()) return;
    this.session = null;
    this.pointer = null;
    s?.lease.release();
    this.snap.hidden = true;
    this.editor.refresh();
  }
  private snapValue(event: PointerEvent, value: number): number {
    const s = this.session;
    const snap =
      s && !s.rotate && !event.shiftKey
        ? bodySnap(this.editor, s.pivotOnly ? [] : s.edit.ids, s.edit.pivot, s.axis, value)
        : null;
    this.snap.hidden = !snap;
    if (snap) {
      const point = this.editor.world.project(snap.point);
      this.snap.style.left = `${point.x}px`;
      this.snap.style.top = `${point.y}px`;
    }
    return snap?.value ?? value;
  }
  private update = (): void => {
    const bodies = selectedBodies(this.editor),
      key = bodies
        .map((b) => b.id)
        .sort()
        .join(",");
    if (!this.session && key !== this.selection) {
      this.selection = key;
      this.pivotMode = false;
      this.customPivot = false;
    }
    if (!this.session && !this.customPivot && bodies.length) this.pivot = bodyCenter(bodies);
    this.gizmo.root.hidden =
      !!this.editor.world.active ||
      this.editor.modeling.tool !== "move" ||
      (!bodies.length && !this.session) ||
      (!!this.editor.interactions.current &&
        !["body-move", "scale"].includes(this.editor.interactions.current.kind));
    this.gizmo.input.hidden = !this.session || !this.gizmo.input.hasAttribute("aria-label");
    this.gizmo.input.setAttribute("aria-invalid", String(this.session?.valid === false));
    const session = this.session;
    const pivot =
      session && !session.rotate && session.valid
        ? (session.edit.pivot.map((v, i) => v + session.edit.translation[i]) as Vector)
        : this.pivot;
    this.gizmo.update(this.editor, pivot, this.pivotMode);
  };
  dispose(): void {
    this.cancel();
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.pivotDrag.dispose();
    this.gizmo.dispose();
    this.snap.remove();
  }
}
