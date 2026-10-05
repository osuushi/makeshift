import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import type { ModelingTarget } from "../sketch/model-selection-state.js";
import type { Vector } from "../sketch/planes.js";
import { AxialDrag } from "./axial-drag.js";
import type { BodyShell } from "./body.js";
import { offsetHandle } from "./face-offset-targets.js";
import { ShellWidget } from "./shell-widget.js";

/** One signed shell gesture; only the backend can accept geometry. */
export class ShellControls {
  private widget: ShellWidget;
  private abort = new AbortController();
  private lease: InteractionLease | null = null;
  private selection: BodyShell["selection"] = [];
  private original: ModelingTarget[] = [];
  private axis: { center: Vector; normal: Vector } | null = null;
  private thickness = 0;
  private valid = false;
  private invalid = false;
  private pending: BodyShell | null = null;
  private latest: BodyShell | null = null;
  private running: Promise<void> | null = null;
  private drag: AxialDrag;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.widget = new ShellWidget(
      overlay,
      () => void this.finish(),
      () => void this.cancel(),
    );
    const options = { signal: this.abort.signal };
    this.drag = new AxialDrag(editor, this.widget.handle, this.abort.signal, {
      begin: () => this.begin(),
      lease: () => this.lease,
      axis: () => this.axis,
      value: () => (Number.isFinite(this.thickness) ? this.thickness : 0),
      queue: (value) => this.queue(value),
      focus: () => this.focus(),
    });
    this.widget.handle.addEventListener(
      "click",
      (e) => {
        if (e.detail === 0 && this.begin()) this.focus();
      },
      options,
    );
    this.widget.input.addEventListener("focus", () => this.begin(), options);
    this.widget.input.addEventListener(
      "input",
      () => {
        this.queue(this.widget.input.value.trim() ? Number(this.widget.input.value) : NaN);
      },
      options,
    );
    onModelKeydown(
      (event) => {
        if (!this.lease || !["Enter", "Escape"].includes(event.key)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.key === "Escape") void this.cancel();
        else void this.finish();
      },
      { ...options, capture: true },
    );
    editor.world.changed.add(this.update);
    this.update();
  }
  private focus(): void {
    this.widget.input.focus();
    this.widget.input.select();
  }
  async reopen(operation: BodyShell): Promise<void> {
    this.editor.modeling.setTool("shell");
    this.update();
    if (!this.begin(operation)) throw new Error("Cannot restore shell inputs");
    this.queue(operation.thickness);
    await this.running;
    if (!this.valid) throw new Error("Cannot regenerate the accepted shell");
    this.focus();
  }
  private begin(restored?: BodyShell): boolean {
    if (this.lease) return this.lease.phase === "editing";
    const resolved = this.editor.modeling.resolve("shell");
    if (this.editor.blocked || !resolved.available || !this.axis) return false;
    this.original = [...this.editor.modeling.targets];
    this.selection = restored ? structuredClone(restored.selection) : resolved.inputs;
    this.lease = this.editor.interactions.acquire(
      "shell",
      () => this.cancel(),
      () => this.finish(),
      { navigation: "when-released" },
    );
    if (!this.lease) return false;
    this.thickness = restored?.thickness ?? 0;
    this.widget.input.value = String(this.thickness);
    this.valid = this.invalid = false;
    this.latest = this.pending = null;
    this.lease.trackHistory(
      this.widget.root,
      () => this.thickness,
      async (value) => {
        this.widget.input.value = String(value);
        this.queue(value);
        await this.running;
      },
    );
    this.editor.modeling.hover = null;
    this.editor.bodiesVisible = true;
    this.editor.notice = "Shell · Negative inward, positive outward · Selected faces stay open";
    this.editor.refresh();
    return true;
  }
  private queue(thickness: number): void {
    if (this.lease?.phase !== "editing" || thickness === this.latest?.thickness) return;
    this.thickness = thickness;
    this.valid = false;
    this.invalid = !Number.isFinite(thickness);
    this.latest = this.pending = { selection: this.selection, thickness };
    if (!this.running) this.running = this.drain();
    this.editor.refresh();
  }
  private async drain(): Promise<void> {
    while (this.pending && this.lease?.phase === "editing") {
      const request = this.pending;
      this.pending = null;
      const zero = request.thickness === 0;
      const success = await this.editor.store.request(
        zero ? { kind: "discard" } : { kind: "shell", operation: request },
      );
      if (this.lease?.phase === "editing" && request === this.latest) {
        this.valid = success;
        this.invalid = !success;
        // A rejected thickness cannot leave an apparently acceptable stale preview.
        this.lease.show(success && !zero ? this.editor.store.candidate : null);
        if (success) this.editor.notice = "Shell · Enter to accept · Escape to cancel";
      }
      this.editor.refresh();
    }
    this.running = null;
    this.editor.refresh();
  }
  private async finish(): Promise<boolean> {
    await this.running;
    const lease = this.lease;
    if (!lease || this.drag.active) return false;
    if (!this.latest || this.thickness === 0) {
      await this.cancel();
      return true;
    }
    if (!this.valid || !lease.close()) return false;
    if (!(await this.editor.accept())) {
      lease.phase = "editing";
      this.editor.refresh();
      return false;
    }
    this.editor.modeling.targets = this.selection.map(({ body }) => ({ kind: "body", body }));
    this.end(lease);
    return true;
  }
  private async cancel(): Promise<void> {
    const lease = this.lease;
    if (!lease?.close()) return;
    this.pending = null;
    this.drag.reset();
    lease.releaseCapture();
    lease.show(null);
    await this.editor.store.cancelPreview();
    await this.running;
    this.editor.modeling.targets = this.original;
    this.end(lease);
  }
  private end(lease: InteractionLease): void {
    this.widget.input.blur();
    this.lease = null;
    this.editor.notice = "";
    lease.release();
    this.editor.refresh();
  }
  private update = (): void => {
    if (!this.lease) {
      const resolved = this.editor.modeling.resolve("shell");
      if (
        this.editor.world.active ||
        this.editor.interactions.current ||
        this.editor.modeling.tool !== "shell" ||
        !resolved.available
      ) {
        this.widget.root.hidden = true;
        return;
      }
      this.selection = resolved.inputs;
      const first = this.selection[0];
      const body = this.editor.store.data.bodies?.find((b) => b.id === first?.body);
      const face = body?.faces.find((f) => first.faces.includes(f.id)) ?? body?.faces[0];
      this.axis =
        face && (face.plane || face.cylinder || face.offsetHandle)
          ? offsetHandle(this.editor, face)
          : null;
      if (!this.axis && body) {
        const b = body.bounds;
        this.axis = { center: [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, b[5]], normal: [0, 0, 1] };
      }
    }
    if (!this.axis) {
      this.widget.root.hidden = true;
      return;
    }
    this.widget.update(
      this.editor,
      this.axis,
      this.lease ? this.thickness : 0,
      this.selection.reduce((n, s) => n + s.faces.length, 0),
      !!this.lease,
      this.valid,
      !!this.lease && this.invalid,
    );
  };
  dispose(): void {
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.widget.dispose();
  }
}
