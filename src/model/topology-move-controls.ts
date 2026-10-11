import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { Vector } from "../sketch/planes.js";
import { numericFocus } from "../tools/menu-focus.js";
import type { EdgeMovement, FaceMovement } from "./body.js";
import { gizmoPointer } from "./body-drag.js";
import { BodyGizmo } from "./body-gizmo.js";
import { axes } from "./body-placement.js";
import type { CurrentTransform } from "./current-transform.js";
import { GizmoInputs, type GizmoPointer } from "./gizmo-inputs.js";
import { TopologyMovePivot } from "./topology-move-pivot.js";
import {
  createTopologyMoveActions,
  updateTopologyMovePresentation,
} from "./topology-move-presentation.js";
import { createMovementTransform, trackMovementHistory } from "./topology-move-transform.js";
import {
  composeMovement,
  movementIsIdentity,
  movementNormal,
  movementRequest,
  movementTargets,
  restoredMovement,
  type TopologyMovement,
} from "./topology-movement.js";

export class TopologyMoveControls {
  private gizmo: BodyGizmo;
  private currentTransform: CurrentTransform;
  private pivot: TopologyMovePivot;
  private accept: HTMLButtonElement;
  private cancelButton: HTMLButtonElement;
  private abort = new AbortController();
  private lease: InteractionLease | null = null;
  private edit: TopologyMovement | null = null;
  private direction: Vector = [1, 0, 0];
  private rotate = false;
  private verified: TopologyMovement | null = null;
  private valid = false;
  private invalid = false;
  private pending: TopologyMovement | null = null;
  private latest: TopologyMovement | null = null;
  private running: Promise<void> | null = null;
  private pointer: GizmoPointer | null = null;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
    private kind: "faces" | "edges" = "faces",
  ) {
    this.gizmo = new BodyGizmo(overlay, this.start, kind);
    this.currentTransform = createMovementTransform(
      editor,
      kind,
      () => (this.lease?.phase === "editing" ? (this.latest ?? this.verified ?? this.edit) : null),
      (movement, invalid) => {
        this.invalid = invalid;
        this.valid = false;
        this.pending = this.latest = movement;
        if (movement) {
          this.edit = movement;
          this.gizmo.input.value = "0";
          if (!this.running) this.running = this.drain();
        }
      },
    );
    this.gizmo.root.append(this.currentTransform.root);
    this.pivot = new TopologyMovePivot(editor, this.gizmo.pivot);
    const actions = createTopologyMoveActions(
      this.gizmo,
      kind,
      () => void this.finish(),
      () => void this.cancel(),
    );
    this.accept = actions.accept;
    this.cancelButton = actions.cancelButton;
    new GizmoInputs(editor, this.gizmo.input, this.abort.signal, {
      gesture: () => (this.pointer ? { pointer: this.pointer, rotate: this.rotate } : null),
      active: () => !!this.lease,
      queue: (value) => this.queue(value),
      release: (moved) => {
        this.pointer = null;
        this.lease?.releaseCapture();
        if (!moved) {
          this.gizmo.input.focus();
          this.gizmo.input.select();
        }
        editor.refresh();
      },
      finish: () => this.finish(),
      cancel: () => this.cancel(),
    });
    editor.world.changed.add(this.update);
    this.update();
  }
  async reopen(operation: FaceMovement | EdgeMovement): Promise<void> {
    const edit = restoredMovement(this.editor, operation);
    this.pivot.point = [...edit.pivot];
    this.direction = edit.axis;
    this.rotate = false;
    if (!this.open(edit)) throw new Error("Cannot restore topology movement inputs");
    this.currentTransform.show(edit);
    this.editor.modeling.setTool("move");
    this.pending = this.latest = edit;
    this.gizmo.input.value = "0";
    this.gizmo.input.setAttribute("aria-label", "Additional movement");
    this.running = this.drain();
    await this.running;
    if (!this.valid) throw new Error("Cannot regenerate the accepted topology movement");
    this.currentTransform.translation[0].focus();
    this.currentTransform.translation[0].select();
  }
  private open(edit: TopologyMovement): boolean {
    this.lease = this.editor.interactions.acquire(
      this.kind === "faces" ? "face-move" : "edge-move",
      () => this.cancel(),
      () => this.finish(),
      {
        navigation: "when-released",
        settled: async () => {
          await this.running;
        },
      },
    );
    if (!this.lease) return false;
    this.edit = edit;
    trackMovementHistory(
      this.lease,
      this.gizmo,
      this.currentTransform,
      this.editor,
      this.kind,
      () => this.latest ?? this.edit,
      async (state) => {
        this.edit = this.latest = this.pending = state;
        this.valid = false;
        if (!this.running) this.running = this.drain();
        await this.running;
      },
    );
    return true;
  }
  private start = (event: PointerEvent, axis: string, rotate: boolean): void => {
    if (event.button || this.editor.blocked || this.pointer || (rotate && this.kind === "edges"))
      return;
    this.direction =
      axis === "N"
        ? (movementNormal(this.editor, movementTargets(this.editor, this.kind)) ?? [0, 0, 1])
        : axes[axis];
    if (!this.lease) {
      const targets = movementTargets(this.editor, this.kind);
      if (
        !targets ||
        !this.open({
          ...targets,
          pivot: [...this.pivot.point],
          axis: this.direction,
          angle: 0,
          translation: [0, 0, 0],
        })
      )
        return;
    }
    if (this.lease?.phase !== "editing") return;
    this.edit = this.verified ?? this.edit;
    this.rotate = rotate;
    this.pointer = gizmoPointer(this.editor, this.pivot.point, axis, event, this.direction);
    this.gizmo.input.setAttribute(
      "aria-label",
      `${this.kind === "faces" ? "Face" : "Edge"} ${rotate ? "rotation" : "translation"} ${axis === "N" ? "normal" : axis}`,
    );
    if (event.pointerId !== -1) this.lease.capture(event.currentTarget as Element, event.pointerId);
    else {
      this.gizmo.input.focus();
      this.gizmo.input.select();
    }
    event.preventDefault();
    this.queue(0);
  };
  private queue(value: number): void {
    if (!this.edit || this.lease?.phase !== "editing") return;
    this.valid = false;
    this.invalid = !Number.isFinite(value);
    this.editor.notice = this.invalid
      ? "Enter a finite movement"
      : `Move ${this.kind} · Enter to accept · Escape to cancel`;
    if (this.invalid) this.latest = this.pending = null;
    else {
      this.latest = this.pending = composeMovement(
        this.edit,
        this.pivot.point,
        this.direction,
        this.rotate,
        value,
      );
      if (!this.running) this.running = this.drain();
    }
    if (!numericFocus(this.gizmo.input)) this.gizmo.input.value = String(Number(value.toFixed(4)));
    this.editor.refresh();
  }
  private async drain(): Promise<void> {
    while (this.pending && this.lease?.phase === "editing") {
      const request = this.pending;
      this.pending = null;
      const success = await this.editor.store.request(movementRequest(request));
      if (this.lease?.phase !== "editing" || request !== this.latest) continue;
      this.valid = success;
      this.invalid = !success;
      if (success) {
        this.verified = request;
        this.lease.show(this.editor.store.candidate);
      }
      // Keep the last valid image for a rejected request, but never accept it as
      // though it were the requested value. The backend clears rejected candidates.
      this.editor.refresh();
    }
    this.running = null;
    this.editor.refresh();
  }
  private async finish(): Promise<boolean> {
    await this.running;
    const lease = this.lease;
    if (!lease || this.pointer || !this.valid || this.pending) return false;
    if (!this.latest || movementIsIdentity(this.latest)) {
      await this.cancel();
      return true;
    }
    if (!lease.close()) return false;
    const success = await this.editor.accept();
    if (!success) {
      lease.phase = "editing";
      this.editor.refresh();
      return false;
    }
    const latest = this.latest;
    if (this.pivot.custom && latest)
      this.pivot.point = latest.pivot.map((n, i) => n + latest.translation[i]) as Vector;
    this.end(lease);
    return true;
  }
  private async cancel(): Promise<void> {
    const lease = this.lease;
    if (!lease?.close()) return;
    this.pending = this.latest = null;
    this.pointer = null;
    lease.releaseCapture();
    lease.show(null);
    await this.editor.store.cancelPreview();
    await this.running;
    this.end(lease);
  }
  private end(lease: InteractionLease): void {
    this.currentTransform.reset();
    this.lease = null;
    this.edit = this.latest = this.pending = this.verified = null;
    this.invalid = false;
    this.gizmo.input.blur();
    this.gizmo.input.removeAttribute("aria-label");
    this.editor.notice = "";
    lease.release();
    this.editor.refresh();
  }
  private update = (): void => {
    this.currentTransform.update(
      this.latest ?? this.verified ?? this.edit,
      this.lease?.phase !== "editing",
    );
    const targets = movementTargets(this.editor, this.kind);
    this.pivot.update(targets, !!this.lease);
    updateTopologyMovePresentation(
      this.editor,
      this.gizmo,
      this.kind,
      targets,
      this.pivot.point,
      this.lease,
      this.valid,
      !!this.running,
      !!this.latest && !movementIsIdentity(this.latest),
      this.invalid,
      this.accept,
      this.cancelButton,
    );
  };
  dispose(): void {
    this.abort.abort();
    this.pivot.dispose();
    this.editor.world.changed.delete(this.update);
    this.gizmo.dispose();
  }
}
