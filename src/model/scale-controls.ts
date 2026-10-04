import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import type { Vector } from "../sketch/planes.js";
import { installBodyTransformEnter } from "./body-transform-enter.js";
import { type ScaleOperation, type ScaleSource, scaleFactors } from "./scale.js";
import { ScaleGestures } from "./scale-gestures.js";
import { scalePivot, scaleSelection } from "./scale-selection.js";
import { ScaleWidget } from "./scale-widget.js";
import { boxLocal, boxWorld, selectionBox, type TransformBox } from "./transform-box.js";
import { TransformBoxMove } from "./transform-box-move.js";
import { installTransformHandoff } from "./transform-handoff.js";
import { registerTransformTool } from "./transform-tool.js";

export class ScaleControls {
  private disposeTool: () => void;
  private widget: ScaleWidget;
  private gestures: ScaleGestures;
  private boxMove: TransformBoxMove;
  private abort = new AbortController();
  private lease: InteractionLease | null = null;
  private source: ScaleSource | null = null;
  private box: TransformBox | null = null;
  private pivot: Vector = [0, 0, 0];
  private operationPivot: Vector = [0, 0, 0];
  private preserveNumericPivot = false;
  private previousPivot: { x: number; y: number } | null = null;
  private originalIds = new Set<string>();
  private valid = false;
  private pending: ScaleOperation | null = null;
  private latest: ScaleOperation | null = null;
  private running: Promise<void> | null = null;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
    activate: () => void | Promise<void>,
    referenceSelected: () => boolean = () => false,
  ) {
    this.disposeTool = registerTransformTool(editor, activate, referenceSelected);
    this.widget = new ScaleWidget(overlay);
    this.gestures = new ScaleGestures(
      editor,
      this.widget,
      () => {
        if (!this.lease) this.begin();
        return this.lease && this.box
          ? {
              pivot: this.pivot,
              operationPivot: this.operationPivot,
              factors: this.widget.values(),
              box: this.box,
              lease: this.lease,
            }
          : null;
      },
      (factors, pivot) => {
        this.operationPivot = pivot;
        this.widget.setValues(factors);
        this.queue();
      },
    );
    this.boxMove = new TransformBoxMove(editor, () => this.finish());
    this.widget.accept.onclick = () => void this.finish();
    this.widget.cancel.onclick = () => void this.cancel();
    this.widget.factors.forEach((input, index) => {
      input.onfocus = () => {
        if (!this.lease) this.begin();
      };
      input.oninput = () => {
        if (!this.lease) this.begin();
        if (this.widget.linked.checked)
          this.widget.factors.forEach((other, i) => {
            if (i !== index) other.value = input.value;
          });
        if (this.box && !this.preserveNumericPivot) {
          const box = this.box;
          const local = boxLocal(box, this.pivot);
          const factors = this.widget.values();
          this.operationPivot = boxWorld(
            box,
            local.map((value, i) =>
              Number.isFinite(factors[i]) && factors[i] !== 1 ? box.min[i] : value,
            ) as Vector,
          );
        }
        this.queue();
      };
    });
    this.events();
    installBodyTransformEnter(editor, this.abort.signal);
    installTransformHandoff(
      editor,
      () => !!this.lease && !this.gestures.active,
      () => this.finish(),
      this.abort.signal,
    );
    editor.world.transformBoxContains = (x, y) => {
      const source = this.source ?? scaleSelection(editor);
      const box = this.box ?? (source ? selectionBox(editor, source) : null);
      if (!box || (!this.lease && !editor.transformAnchor?.active)) return false;
      return this.widget.contains(
        editor,
        box,
        this.lease ? this.operationPivot : (editor.transformAnchor?.point ?? scalePivot(editor)),
        this.lease ? this.widget.values() : [1, 1, 1],
        x,
        y,
      );
    };
    editor.world.changed.add(this.update);
    this.update();
  }
  async reopen(operation: ScaleOperation): Promise<void> {
    this.begin(operation);
    if (!this.lease) throw new Error("Cannot restore scale inputs");
    this.queue();
    await this.running;
    if (!this.valid) throw new Error("Cannot regenerate the accepted scale");
    this.widget.factors[0].focus();
    this.widget.factors[0].select();
  }
  private begin(restored?: ScaleOperation): void {
    const e = this.editor,
      source = restored ?? scaleSelection(e);
    if (!source || e.blocked || e.interactions.current) return;
    const box = selectionBox(e, source);
    if (!box) return;
    this.lease = e.interactions.acquire(
      "scale",
      () => this.cancel(),
      () => this.finish(),
      { navigation: "when-released" },
    );
    if (!this.lease) return;
    this.source = source;
    this.box = box;
    this.pivot = restored ? [...restored.pivot] : (e.transformAnchor?.point ?? scalePivot(e));
    this.preserveNumericPivot = !!restored;
    this.operationPivot = [...(restored?.pivot ?? this.pivot)];
    if (restored) {
      const factors = scaleFactors(restored);
      this.widget.setValues(factors);
      this.widget.linked.checked = factors.every((value) => value === factors[0]);
    }
    this.previousPivot = e.pivot;
    if (source.kind === "curves") {
      const local = boxLocal(box, this.pivot);
      e.pivot = { x: local[0], y: local[1] };
    }
    this.originalIds = new Set(e.sketch?.curves.map((c) => c.id));
    this.valid = true;
    this.latest = this.pending = null;
    this.lease.trackHistory(
      this.widget.root,
      () => ({
        factors: this.widget.values(),
        pivot: this.operationPivot,
        linked: this.widget.linked.checked,
      }),
      async (state) => {
        this.operationPivot = state.pivot;
        this.widget.linked.checked = state.linked;
        this.widget.factors.forEach((input, i) => {
          input.value = String(state.factors[i]);
        });
        this.queue();
        await this.running;
      },
    );
    e.message = "";
    e.notice =
      "Transform · Option resizes about anchor · Shift scales uniformly · Enter accepts · Escape cancels";
  }
  private events(): void {
    const options = { signal: this.abort.signal, capture: true };
    for (const type of ["pointerdown", "click", "dblclick"] as const)
      this.editor.world.canvas.addEventListener(
        type,
        (event) => {
          if (!this.lease || event.button || event.ctrlKey || event.metaKey) return;
          event.preventDefault();
          event.stopImmediatePropagation();
        },
        options,
      );
    onModelKeydown((event) => {
      if (!this.lease || !["Escape", "Enter"].includes(event.key)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Escape") void this.cancel();
      else void this.finish();
    }, options);
  }
  private queue(): void {
    if (this.lease?.phase !== "editing" || !this.source) return;
    const factors = this.widget.values();
    this.valid = false;
    this.pending = this.latest = null;
    const valid = factors.every((v) => Number.isFinite(v) && v > 0);
    this.widget.factors.forEach((input, i) => {
      input.setAttribute("aria-invalid", String(!Number.isFinite(factors[i]) || factors[i] <= 0));
    });
    if (valid) {
      this.pending = this.latest = {
        ...this.source,
        pivot: [...this.operationPivot],
        factor: 1,
        factors,
      };
      if (!this.running) this.running = this.drain();
    } else this.editor.message = "Enter positive scale factors";
    this.editor.refresh();
  }
  private async drain(): Promise<void> {
    while (this.pending && this.lease?.phase === "editing") {
      const operation = this.pending;
      this.pending = null;
      const success = await this.editor.store.request({ kind: "scale", operation });
      if (this.lease?.phase === "editing" && operation === this.latest) {
        this.valid = success;
        if (success) this.lease.show(this.editor.store.candidate);
      }
      this.editor.refresh();
    }
    this.running = null;
    this.editor.refresh();
  }
  private async finish(): Promise<boolean> {
    await this.running;
    const lease = this.lease;
    if (!lease || !this.valid) return false;
    if (!this.latest) {
      await this.cancel();
      return true;
    }
    if (!lease.close()) return false;
    this.gestures.stop();
    if (!(await this.editor.accept())) {
      lease.phase = "editing";
      this.editor.refresh();
      return false;
    }
    if (this.source?.kind === "curves") {
      const source = this.source;
      const sketch = this.editor.store.data.sketches.find((s) => s.id === source.sketchId);
      const curves = sketch?.curves ?? [];
      const ids = source.ids.flatMap((id) => {
        const start = curves.findIndex((curve) => curve.id === id);
        if (start < 0) return [];
        const pieces = [id];
        for (let i = start + 1; i < curves.length && !this.originalIds.has(curves[i].id); i++)
          pieces.push(curves[i].id);
        return pieces;
      });
      this.editor.select(ids);
      this.editor.moveMode = true;
      if (this.box) {
        const local = boxLocal(this.box, this.pivot);
        this.editor.pivot = { x: local[0], y: local[1] };
      }
    }
    this.end(lease);
    return true;
  }
  private async cancel(): Promise<void> {
    const lease = this.lease;
    if (!lease?.close()) return;
    this.gestures.stop();
    this.pending = null;
    lease.show(null);
    await this.editor.store.cancelPreview();
    await this.running;
    if (this.source?.kind === "curves") this.editor.pivot = this.previousPivot;
    this.end(lease);
  }
  private end(lease: InteractionLease): void {
    this.lease = null;
    this.source = null;
    this.box = null;
    this.previousPivot = null;
    this.operationPivot = [0, 0, 0];
    this.preserveNumericPivot = false;
    this.widget.setValues([1, 1, 1]);
    this.widget.factors.forEach((input) => {
      input.setAttribute("aria-invalid", "false");
    });
    this.editor.notice = "";
    lease.release();
    this.editor.refresh();
  }
  private update = (): void => {
    const e = this.editor,
      source = this.source ?? scaleSelection(e);
    const box = this.box ?? (source ? selectionBox(e, source) : null);
    const active = !!this.lease;
    const visible = !!box && (active || (!!e.transformAnchor?.active && !e.interactions.current));
    this.widget.update(
      visible,
      active,
      this.valid,
      e.blocked || !!this.running,
      active && this.lease?.phase !== "editing",
    );
    if (visible && box) {
      const factors = this.widget.values();
      this.widget.position(
        e,
        box,
        active ? this.operationPivot : (e.transformAnchor?.point ?? scalePivot(e)),
        active ? this.pivot : (e.transformAnchor?.point ?? scalePivot(e)),
        factors.every((v) => Number.isFinite(v) && v > 0) ? factors : [1, 1, 1],
      );
    }
  };
  dispose(): void {
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.gestures.dispose();
    this.boxMove.dispose();
    this.widget.dispose();
    this.editor.world.transformBoxContains = null;
    this.disposeTool();
  }
}
