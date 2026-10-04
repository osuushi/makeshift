import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { LiftSource, Revolution } from "./body.js";
import { extrusionAxis } from "./extrude-axis.js";
import { ExtrudeTargets } from "./extrude-targets.js";
import { ReopenCompletion } from "./reopen-completion.js";
import type { RevolveAxis } from "./revolve-axis.js";
import { installRevolveDrag } from "./revolve-drag.js";
import { RevolveInputs } from "./revolve-inputs.js";
import { RevolveWidget } from "./revolve-widget.js";

export class RevolveControls {
  readonly widget: RevolveWidget;
  lease: InteractionLease | null = null;
  frame: ReturnType<typeof extrusionAxis> = null;
  axis: RevolveAxis | null = null;
  angle = 360;
  height = 0;
  private completion = new ReopenCompletion();
  private picking = false;
  private hover: RevolveAxis | null = null;
  private abort = new AbortController();
  private sources: LiftSource[] = [];
  private mode: Revolution["mode"] = "auto";
  private targets: ExtrudeTargets;
  private valid = false;
  private lastGood = "";
  private inputError = "";
  private pending: Revolution | null = null;
  private latest: Revolution | null = null;
  private running: Promise<void> | null = null;
  get active(): boolean {
    return !!this.lease;
  }
  constructor(
    readonly editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.targets = new ExtrudeTargets(editor, () => {
      if (this.mode === "auto") this.mode = editor.store.booleanMode ?? "auto";
      this.queue();
    });
    this.widget = new RevolveWidget((mode) => {
      this.mode = mode;
      this.queue();
    });
    this.widget.options.append(this.targets.root, this.completion.root);
    overlay.append(this.widget.root);
    this.widget.entry.onclick = () => this.begin();
    this.widget.axis.onclick = () => {
      if (editor.blocked) return;
      this.picking = true;
      this.hover = null;
      this.latest = null;
      this.valid = false;
      this.lease?.show(null);
      editor.notice = "Choose a straight edge, cylindrical face or world axis in the profile plane";
      editor.refresh();
    };
    this.widget.accept.onclick = () => void this.finish();
    for (const key of ["angle", "height"] as const)
      this.widget[key].addEventListener(
        "input",
        () => {
          const field = this.widget[key];
          this[key] = field.value.trim() ? Number(field.value) : NaN;
          this.queue();
        },
        { signal: this.abort.signal },
      );
    new RevolveInputs(editor, this.abort.signal, {
      state: () => ({
        lease: this.lease,
        frame: this.frame,
        picking: this.picking,
        hover: this.hover,
      }),
      hover: (axis) => {
        this.hover = axis;
        editor.refresh();
      },
      choose: (axis) => {
        this.axis = axis;
        this.picking = false;
        editor.notice = "Revolve · angle and total height · Enter accepts · Escape cancels";
        this.queue();
        this.lease?.history?.checkpoint();
      },
      mode: (mode) => {
        this.mode = mode;
        this.queue();
        this.lease?.history?.checkpoint();
      },
      cancel: () => this.cancel(),
      finish: () => this.finish(),
    });
    installRevolveDrag(this, this.abort.signal);
    editor.world.changed.add(this.update);
    this.update();
  }
  async reopen(revolution: Revolution, cleanup: boolean): Promise<void> {
    this.editor.modeling.setTool("revolve");
    this.begin(revolution, cleanup);
    if (!this.lease) throw new Error("Cannot restore revolution inputs");
    this.queue();
    await this.running;
    if (!this.valid) throw new Error("Cannot regenerate the accepted revolution");
    this.widget.angle.focus();
    this.widget.angle.select();
  }
  begin(restored?: Revolution, cleanup = false): void {
    const editor = this.editor;
    if (editor.blocked || editor.interactions.current || editor.world.active) return;
    this.frame = extrusionAxis(editor);
    if (!this.frame) return;
    const resolution = editor.modeling.resolve("revolve");
    if (!resolution.available) return;
    this.sources = restored ? structuredClone(restored.sources) : resolution.inputs;
    this.lease = editor.interactions.acquire(
      "revolve",
      () => this.cancel(),
      () => this.finish(),
      { navigation: "when-released" },
    );
    if (!this.lease) return;
    this.hover = null;
    this.axis = restored?.axis ?? null;
    this.lastGood = this.inputError = "";
    this.angle = restored?.angle ?? 360;
    this.height = restored?.height ?? 0;
    this.mode = restored?.mode ?? "auto";
    this.picking = !restored;
    this.widget.angle.value = String(this.angle);
    this.widget.height.value = String(this.height);
    this.completion.reset();
    if (restored) this.completion.begin(cleanup);
    this.valid = false;
    this.targets.reset();
    this.targets.selected = restored?.targets;
    this.targets.restoredEligible = restored?.eligibleTargets;
    this.latest = null;
    this.lease.trackHistory(
      this.widget.root,
      () => ({
        axis: this.axis,
        angle: this.angle,
        height: this.height,
        mode: this.mode,
        targets: this.targets.selected,
        picking: this.picking,
        cleanup: this.completion.cleanup,
      }),
      async (state) => {
        this.completion.input.checked = state.cleanup;
        this.axis = state.axis;
        this.angle = state.angle;
        this.height = state.height;
        this.mode = state.mode;
        this.targets.selected = state.targets;
        this.picking = state.picking;
        this.widget.angle.value = String(state.angle);
        this.widget.height.value = String(state.height);
        if (this.picking) {
          this.latest = this.pending = null;
          this.valid = false;
          this.lease?.show(null);
          await editor.store.request({ kind: "discard" });
        } else {
          this.queue();
          await this.running;
        }
      },
    );
    editor.notice = "Choose a straight edge, cylindrical face or world axis in the profile plane";
    editor.refresh();
  }
  queue(): void {
    if (!this.axis || !this.lease || this.picking) return;
    if (
      !Number.isFinite(this.angle) ||
      !Number.isFinite(this.height) ||
      Math.abs(this.angle) < 1e-7 ||
      (this.height === 0 && Math.abs(this.angle) > 360)
    ) {
      this.valid = false;
      this.pending = this.latest = null;
      this.inputError =
        this.height === 0 && Math.abs(this.angle) > 360
          ? "Set a nonzero height for more than one revolution"
          : "Enter a nonzero angle and a finite height";
      this.failure(this.inputError);
      this.editor.refresh();
      return;
    }
    this.inputError = "";
    const request: Revolution = {
      sources: this.sources,
      axis: this.axis,
      angle: this.angle,
      height: this.height,
      mode: this.mode,
      targets: this.targets.selected,
      eligibleTargets: this.targets.eligible,
    };
    if (JSON.stringify(request) === JSON.stringify(this.latest)) return;
    this.valid = false;
    this.pending = this.latest = request;
    if (!this.running) this.running = this.drain();
  }
  private async drain(): Promise<void> {
    while (this.pending && this.lease?.phase === "editing") {
      const request = this.pending;
      this.pending = null;
      const success = await this.editor.store.request({ kind: "revolve", revolution: request });
      if (this.lease?.phase === "editing" && this.latest) {
        this.valid = success && request === this.latest;
        if (success) {
          this.lease.show(this.editor.store.candidate);
          this.lastGood = `${request.angle}°, height ${request.height} mm`;
        } else if (request === this.latest) this.failure(this.editor.message);
        // Keep the previous valid presentation, but never accept it for failed input.
      }
      if (this.inputError) this.failure(this.inputError);
      this.editor.refresh();
    }
    this.running = null;
  }
  private failure(message: string): void {
    this.editor.message =
      message +
      (this.lease?.candidate && this.lastGood
        ? ` · Showing last valid preview: ${this.lastGood}`
        : "");
  }
  async finish(): Promise<boolean> {
    await this.running;
    if (this.lease && this.picking && !this.latest) {
      await this.cancel();
      return true;
    }
    if (!this.valid || this.picking || !this.lease?.close()) return false;
    const success = await this.editor.accept();
    if (!success) {
      if (this.lease) this.lease.phase = "editing";
      this.editor.refresh();
      return false;
    }
    this.editor.visibility.setUsedSketchesVisible(this.editor.store.data, this.sources, false);
    this.release();
    return success;
  }
  private async cancel(): Promise<void> {
    if (!this.lease?.close()) return;
    this.pending = null;
    this.lease.releaseCapture();
    await this.editor.store.cancelPreview();
    await this.running;
    this.release();
  }
  private release(): void {
    this.completion.reset();
    this.picking = false;
    this.lease?.release();
    this.lease = null;
    this.editor.notice = "";
    this.editor.message = "";
    this.editor.refresh();
  }
  private update = (): void => {
    const frame = this.active ? this.frame : extrusionAxis(this.editor);
    const mode = this.mode === "auto" ? this.editor.store.booleanMode : this.mode;
    this.widget.update(
      this.editor,
      frame?.center ?? null,
      this.active,
      this.picking,
      this.picking ? this.hover : this.axis,
      this.angle,
      this.height,
      mode,
      this.valid,
      this.sources,
    );
    if (!this.active) this.widget.root.hidden = true;
    this.targets.update(
      this.active && !this.picking && mode !== "new" && !!this.editor.store.data.bodies?.length,
    );
  };
  dispose(): void {
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.widget.dispose();
  }
}
