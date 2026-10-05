import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import { pickModels } from "../sketch/model-selection.js";
import type { LiftSource } from "./body.js";
import { ExtrudeTargets } from "./extrude-targets.js";
import type { Loft } from "./loft.js";
import { LoftGuides } from "./loft-guides.js";
import { type LoftSectionAction, LoftWidget } from "./loft-widget.js";
import { resolveOperation } from "./operation-selection.js";
import { ReopenCompletion } from "./reopen-completion.js";

export class LoftControls {
  readonly widget: LoftWidget;
  private guides = new LoftGuides();
  private completion = new ReopenCompletion();
  private lease: InteractionLease | null = null;
  private sources: LiftSource[] = [];
  private alignment: number[] | undefined;
  private collecting = false;
  private mode: Loft["mode"] = "auto";
  private targets: ExtrudeTargets;
  private valid = false;
  private pending: Loft | null = null;
  private latest: Loft | null = null;
  private running: Promise<void> | null = null;
  private abort = new AbortController();
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.targets = new ExtrudeTargets(editor, () => this.queue());
    this.widget = new LoftWidget(
      this.sectionAction,
      () => this.queue(),
      (mode) => {
        this.mode = mode;
        this.queue();
      },
    );
    this.widget.root.append(this.targets.root, this.completion.root);
    overlay.append(this.guides.root, this.widget.root);
    this.widget.add.onclick = () => {
      this.collecting = !this.collecting;
      this.notice();
      editor.refresh();
    };
    this.widget.automatic.onclick = () => {
      this.alignment = undefined;
      this.queue();
    };
    this.widget.accept.onclick = () => void this.finish();
    this.widget.cancel.onclick = () => void this.cancel();
    this.installPicking();
    this.installKeys();
    editor.world.changed.add(this.update);
    this.update();
  }
  async reopen(operation: Loft, cleanup: boolean): Promise<void> {
    this.editor.modeling.setTool("loft");
    this.begin(operation, cleanup);
    if (!this.lease) throw new Error("Cannot restore loft sections");
    await this.running;
    if (!this.valid) throw new Error("Cannot regenerate the accepted loft");
    this.widget.shape.focus();
  }
  begin(restored?: Loft, cleanup = false): void {
    const editor = this.editor;
    if (editor.blocked || editor.world.active || editor.interactions.current) return;
    const resolution = editor.modeling.resolve("loft");
    if (editor.modeling.targets.length && !resolution.available) return;
    this.sources = restored
      ? structuredClone(restored.sources)
      : resolution.available
        ? [...resolution.inputs]
        : [];
    this.lease = editor.interactions.acquire(
      "loft",
      () => this.cancel(),
      () => this.finish(),
      { navigation: "when-released" },
    );
    if (!this.lease) return;
    this.alignment = restored?.alignment;
    this.collecting = !restored && this.sources.length < 2;
    this.widget.shape.value = restored?.ruled ? "ruled" : "smooth";
    this.mode = restored?.mode ?? "auto";
    this.completion.reset();
    if (restored) this.completion.begin(cleanup);
    this.valid = false;
    this.latest = this.pending = null;
    this.targets.reset();
    this.targets.selected = restored?.targets;
    this.targets.restoredEligible = restored?.eligibleTargets;
    this.lease.trackHistory(
      this.widget.root,
      () => ({
        sources: this.sources,
        alignment: this.alignment,
        collecting: this.collecting,
        shape: this.widget.shape.value,
        mode: this.mode,
        targets: this.targets.selected,
        cleanup: this.completion.cleanup,
      }),
      async (state) => {
        this.completion.input.checked = state.cleanup;
        this.sources = state.sources;
        this.alignment = state.alignment;
        this.collecting = state.collecting;
        this.widget.shape.value = state.shape;
        this.mode = state.mode;
        this.targets.selected = state.targets;
        this.notice();
        this.queue();
        await this.running;
      },
    );
    this.notice();
    this.queue();
  }
  private notice(): void {
    this.editor.notice = this.collecting
      ? "Loft · click filled regions or planar faces in order · Done adding to accept"
      : "Loft · reorder sections or adjust seams · Enter accepts · Escape cancels";
  }
  private installPicking(): void {
    this.editor.world.canvas.addEventListener(
      "click",
      (event) => {
        if (!this.lease || !this.collecting || event.button || event.metaKey || event.ctrlKey)
          return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (this.editor.blocked) return;
        // Pick accepted source geometry rather than a newly generated loft face.
        const candidate = this.lease.candidate;
        this.lease.show(null);
        const hits = pickModels(this.editor, { x: event.clientX, y: event.clientY });
        this.lease.show(candidate);
        for (const hit of hits) {
          const resolution = resolveOperation("extrude", [hit], this.editor.store.data);
          if (!resolution.available) continue;
          const source = resolution.inputs[0];
          if (this.sources.some((s) => JSON.stringify(s) === JSON.stringify(source))) continue;
          this.sources.push(source);
          this.alignment?.push(0);
          this.queue();
          this.lease.history?.checkpoint();
          return;
        }
        this.editor.message = "Choose another filled region or planar face";
        this.editor.refresh();
      },
      { signal: this.abort.signal, capture: true },
    );
  }
  private installKeys(): void {
    onModelKeydown(
      (event) => {
        if (!this.lease || event.metaKey || event.ctrlKey || event.altKey) return;
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopImmediatePropagation();
          void this.cancel();
        } else if (event.key === "Enter" && !(event.target instanceof HTMLSelectElement)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (this.collecting) {
            this.collecting = false;
            this.notice();
            this.lease.history?.checkpoint();
            this.editor.refresh();
          } else void this.finish();
        } else if (!(event.target instanceof HTMLSelectElement)) {
          const mode = ({ u: "union", s: "subtract", i: "intersect", n: "new" } as const)[
            event.key.toLowerCase() as "u"
          ];
          if (!mode) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          this.mode = mode;
          this.queue();
          this.lease.history?.checkpoint();
        }
      },
      { signal: this.abort.signal, capture: true },
    );
  }
  private sectionAction = (index: number, action: LoftSectionAction): void => {
    if (!this.lease || this.editor.blocked) return;
    if (action === "remove") {
      this.sources.splice(index, 1);
      this.alignment?.splice(index, 1);
    } else if (action === "up" || action === "down") {
      const next = index + (action === "up" ? -1 : 1);
      if (next < 0 || next >= this.sources.length) return;
      [this.sources[index], this.sources[next]] = [this.sources[next], this.sources[index]];
      if (this.alignment)
        [this.alignment[index], this.alignment[next]] = [
          this.alignment[next],
          this.alignment[index],
        ];
    } else {
      this.alignment ??= this.sources.map(() => 0);
      this.alignment[index] += action === "next" ? 1 : -1;
    }
    this.queue();
  };
  private queue(): void {
    if (this.lease?.phase !== "editing") return;
    this.valid = false;
    if (this.sources.length < 2) {
      this.pending = this.latest = null;
      this.lease.show(null);
      this.editor.message = "Choose at least two loft sections";
      this.editor.refresh();
      return;
    }
    const request: Loft = {
      sources: structuredClone(this.sources),
      alignment: this.alignment && [...this.alignment],
      ruled: this.widget.shape.value === "ruled",
      mode: this.mode,
      targets: this.targets.selected,
      eligibleTargets: this.targets.eligible,
    };
    this.pending = this.latest = request;
    if (!this.running) this.running = this.drain();
    this.editor.refresh();
  }
  private async drain(): Promise<void> {
    while (this.pending && this.lease?.phase === "editing") {
      const request = this.pending;
      this.pending = null;
      const success = await this.editor.store.request({ kind: "loft", operation: request });
      if (this.lease?.phase !== "editing" || request !== this.latest) continue;
      this.valid = success;
      if (success) this.lease.show(this.editor.store.candidate);
      else if (this.lease.candidate)
        this.editor.message += " · Showing last valid loft; acceptance disabled";
      this.editor.refresh();
    }
    this.running = null;
  }
  private async finish(): Promise<boolean> {
    await this.running;
    if (!this.latest && this.lease) {
      await this.cancel();
      return true;
    }
    if (!this.valid || this.collecting || !this.lease?.close()) return false;
    if (!(await this.editor.accept(this.completion.cleanup))) {
      this.lease.phase = "editing";
      this.editor.refresh();
      return false;
    }
    this.editor.visibility.setUsedSketchesVisible(this.editor.store.data, this.sources, false);
    this.release();
    return true;
  }
  private async cancel(): Promise<void> {
    if (!this.lease?.close()) return;
    this.pending = null;
    await this.editor.store.cancelPreview();
    await this.running;
    this.release();
  }
  private release(): void {
    this.completion.reset();
    this.lease?.release();
    this.lease = null;
    this.editor.notice = this.editor.message = "";
    this.editor.refresh();
  }
  private update = (): void => {
    this.widget.root.hidden = !this.lease;
    this.guides.root.style.display = this.lease ? "" : "none";
    if (!this.lease) return;
    this.guides.update(this.editor, this.sources);
    this.widget.update(
      this.editor,
      this.sources,
      this.alignment,
      this.collecting,
      this.valid,
      this.mode === "auto" ? (this.editor.store.booleanMode ?? "auto") : this.mode,
    );
    this.targets.update(this.mode !== "new");
  };
  dispose(): void {
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.widget.root.remove();
    this.guides.root.remove();
  }
}
