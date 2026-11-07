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
import { TopologyMovePreview } from "./topology-move-preview.js";
import { createMovementTransform, trackMovementHistory } from "./topology-move-transform.js";
import {
  composeMovement,
  movementIsIdentity,
  movementNormal,
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
  private preview: TopologyMovePreview;
  private pointer: GizmoPointer | null = null;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
    private kind: "faces" | "edges" = "faces",
  ) {
    this.gizmo = new BodyGizmo(overlay, this.start, kind);
    this.preview = new TopologyMovePreview(editor, kind, () => this.lease);
    this.gizmo.root.append(this.preview.feedback);
    this.currentTransform = createMovementTransform(
      editor,
      kind,
      () =>
        this.lease?.phase === "editing"
          ? (this.preview.latest ?? this.preview.verified ?? this.edit)
          : null,
      (movement, invalid) => {
        this.preview.queue(movement, invalid);
        if (movement) {
          this.edit = movement;
          this.gizmo.input.value = "0";
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
    this.preview.queue(edit);
    this.gizmo.input.value = "0";
    this.gizmo.input.setAttribute("aria-label", "Additional movement");
    await this.preview.running;
    if (!this.preview.valid) throw new Error("Cannot regenerate the accepted topology movement");
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
          await this.preview.running;
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
      () => this.preview.latest ?? this.edit,
      async (state) => {
        this.edit = state;
        this.preview.queue(state);
        await this.preview.running;
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
    this.edit = this.preview.verified ?? this.edit;
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
    const invalid = !Number.isFinite(value);
    this.preview.queue(
      invalid
        ? null
        : composeMovement(this.edit, this.pivot.point, this.direction, this.rotate, value),
      invalid,
    );
    if (!numericFocus(this.gizmo.input)) this.gizmo.input.value = String(Number(value.toFixed(4)));
    this.editor.refresh();
  }
  private async finish(): Promise<boolean> {
    await this.preview.running;
    const lease = this.lease;
    if (!lease || this.pointer || !this.preview.valid) return false;
    if (!this.preview.latest || movementIsIdentity(this.preview.latest)) {
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
    const latest = this.preview.latest;
    if (this.pivot.custom && latest)
      this.pivot.point = latest.pivot.map((n, i) => n + latest.translation[i]) as Vector;
    this.end(lease);
    return true;
  }
  private async cancel(): Promise<void> {
    const lease = this.lease;
    if (!lease?.close()) return;
    this.preview.reset();
    this.pointer = null;
    lease.releaseCapture();
    lease.show(null);
    await this.editor.store.cancelPreview();
    await this.preview.running;
    this.end(lease);
  }
  private end(lease: InteractionLease): void {
    this.currentTransform.reset();
    this.lease = null;
    this.edit = null;
    this.preview.reset();
    this.gizmo.input.blur();
    this.gizmo.input.removeAttribute("aria-label");
    this.editor.notice = "";
    lease.release();
    this.editor.refresh();
  }
  private update = (): void => {
    this.currentTransform.update(
      this.preview.latest ?? this.preview.verified ?? this.edit,
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
      this.preview.valid,
      !!this.preview.running,
      !!this.preview.latest && !movementIsIdentity(this.preview.latest),
      this.preview.invalid,
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
