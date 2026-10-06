import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";
import type { PlaneCut } from "./plane-cut.js";
import { planeCrossesBounds } from "./plane-cut-bounds.js";
import { PlaneCandidateView, planeCandidates, planeKey } from "./plane-reference-candidates.js";
import type { PlaneReferencePicker } from "./plane-reference-picker.js";
import { selectionContext } from "./selection-context.js";

export class PlaneCutControls {
  private disposers: (() => void)[] = [];
  private abort = new AbortController();
  private lease: InteractionLease | null = null;
  private source: Pick<PlaneCut, "mode" | "targets"> | null = null;
  private previous: SketchEditor["modeling"]["targets"] = [];
  private valid = false;
  private pending: PlaneCut | null = null;
  private running: Promise<void> | null = null;
  private available = new Set<string>();
  private view: PlaneCandidateView;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
    private picker: PlaneReferencePicker,
  ) {
    for (const mode of ["split", "imprint"] as const) {
      this.disposers.push(
        toolCatalog(editor).register({
          id: mode,
          finishEdit: () => this.source?.mode !== mode,
          label: mode === "split" ? "Split Body" : "Imprint",
          category: "Solid",
          aliases:
            mode === "split"
              ? ["slice", "bisect", "cut with plane"]
              : ["split face", "section face"],
          reason: () =>
            this.source?.mode === mode
              ? null
              : (idleReason(editor) ??
                (this.targets(mode)
                  ? null
                  : mode === "split"
                    ? "Select bodies or faces in Modeling"
                    : "Select faces in Modeling")),
          run: () => (this.source?.mode === mode ? this.deselect() : this.begin(mode)),
        }),
      );
    }
    this.view = new PlaneCandidateView(editor, overlay);
    onModelKeydown(
      (event) => {
        if (!this.lease || !["Escape", "Enter"].includes(event.key)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.key === "Escape") void this.cancel();
        else void this.finish();
      },
      { capture: true, signal: this.abort.signal },
    );
  }
  private targets(mode: PlaneCut["mode"]): PlaneCut["targets"] | null {
    const e = this.editor;
    if (e.world.active) return null;
    const context = selectionContext(e.modeling.targets, e.store.data);
    if (!context.valid || !context.ordered.length) return null;
    if (mode === "split") {
      if (!context.ordered.every((t) => t.kind === "body" || t.kind === "face")) return null;
      return [...new Set(context.faces.map((t) => t.body))].map((body) => ({ body }));
    }
    if (!context.ordered.every((t) => t.kind === "face")) return null;
    const targets: PlaneCut["targets"] = [];
    for (const t of context.faces) {
      const existing = targets.find((p) => p.body === t.body);
      if (existing) existing.faces?.push(t.face);
      else targets.push({ body: t.body, faces: [t.face] });
    }
    return targets;
  }
  async reopen(operation: PlaneCut): Promise<void> {
    this.begin(operation.mode, operation);
    if (!this.lease) throw new Error("Cannot restore cut inputs");
    this.queue(operation);
    await this.running;
    if (!this.valid) throw new Error("Cannot regenerate the accepted cut");
    this.editor.world.canvas.focus();
  }
  private begin(mode: PlaneCut["mode"], restored?: PlaneCut): void {
    const e = this.editor,
      targets = restored ? structuredClone(restored.targets) : this.targets(mode);
    if (!targets || e.blocked || e.interactions.current) return;
    this.lease = e.interactions.acquire(
      "plane-cut",
      () => this.cancel(),
      () => this.finish(),
      { navigation: "when-released" },
    );
    if (!this.lease) return;
    this.source = { mode, targets };
    this.previous = e.modeling.targets;
    e.modeling.targets = [];
    this.valid = false;
    this.pending = null;
    this.lease.trackHistory(
      e.world.canvas,
      () => this.pending ?? restored ?? null,
      async (operation) => {
        if (operation) {
          this.queue(operation);
          await this.running;
        } else {
          this.pending = null;
          this.valid = false;
          this.lease?.show(null);
          await e.store.request({ kind: "discard" });
        }
      },
    );
    this.available.clear();
    e.modeling.hover = null;
    this.picker.start(
      (frame) => this.queue({ frame }),
      (frame) => this.available.has(planeKey(frame)),
      () => void this.deselect(),
      undefined,
      {
        accepts: (surface) =>
          this.editor.store.data.bodies?.some(
            (body) =>
              body.id === surface.body && body.faces.some((face) => face.id === surface.face),
          ) ?? false,
        choose: (surface) => this.queue({ surface }),
      },
    );
    e.message = "";
    this.findReferences();
    e.refresh();
  }
  private findReferences(): void {
    const source = this.source,
      lease = this.lease;
    if (!source || !lease) return;
    const targets = new Set(source.targets.map((target) => target.body));
    const bounds = (this.editor.store.data.bodies ?? [])
      .filter((body) => targets.has(body.id))
      .map((body) => body.bounds);
    const candidates = planeCandidates(this.editor);
    for (const candidate of candidates) {
      const frame = candidate.frame;
      if (!frame) continue;
      const key = planeKey(frame);
      if (bounds.some((box) => planeCrossesBounds(frame, box))) this.available.add(key);
    }
    this.view.show(
      candidates.filter((c) => c.surface || (c.frame && this.available.has(planeKey(c.frame)))),
    );
    const curved = candidates.some((candidate) => candidate.surface);
    this.editor.notice =
      this.available.size || curved
        ? "Pick an outlined plane or face · Escape cancels"
        : "No visible reference crosses the selection bounds · Escape cancels";
    this.editor.refresh();
  }
  private queue(reference: Pick<PlaneCut, "frame" | "surface">): void {
    if (this.lease?.phase !== "editing" || !this.source || this.running) return;
    this.valid = false;
    this.lease.show(null);
    this.pending = { ...this.source, ...reference };
    this.running = this.preview();
  }
  private async preview(): Promise<void> {
    const operation = this.pending;
    if (!operation) return;
    const success = await this.editor.store.request({ kind: "plane-cut", operation });
    if (this.lease?.phase === "editing") {
      const candidate = this.editor.store.candidate;
      this.valid =
        success &&
        !!candidate &&
        JSON.stringify(candidate) !== JSON.stringify(this.editor.store.data);
      this.lease.show(this.valid ? candidate : null);
      if (this.valid) this.editor.notice = "Enter or deselect to accept · Escape cancels";
      else if (success)
        this.editor.notice = "This surface does not cut the selection · Pick another reference";
    }
    this.running = null;
    this.editor.refresh();
  }
  private async deselect(): Promise<void> {
    if (await this.finish()) {
      this.editor.modeling.targets = [];
      this.editor.refresh();
    }
  }
  private async finish(): Promise<boolean> {
    await this.running;
    const lease = this.lease;
    if (lease?.phase !== "editing") return false;
    if (!this.valid) {
      await this.cancel();
      return true;
    }
    if (!lease.close()) return false;
    if (!(await this.editor.accept())) {
      lease.phase = "editing";
      this.editor.refresh();
      return false;
    }
    this.editor.modeling.targets = [];
    this.end();
    return true;
  }
  private async cancel(): Promise<void> {
    if (!this.lease?.close()) return;
    this.lease.show(null);
    await this.editor.store.cancelPreview();
    await this.running;
    this.editor.modeling.targets = this.previous;
    this.end();
  }
  private end(): void {
    const lease = this.lease;
    this.lease = null;
    this.source = null;
    this.pending = null;
    this.picker.stop();
    this.view.show([]);
    this.editor.notice = "";
    lease?.release();
    this.editor.refresh();
  }
  dispose(): void {
    this.abort.abort();
    this.view.dispose();
    for (const dispose of this.disposers) dispose();
  }
}
