import type { InteractionLease } from "../sketch/active-interaction.js";
import { newId, type Sketch } from "../sketch/document.js";
import type { SketchEditor } from "../sketch/editor.js";
import { coplanar, type PlaneFrame } from "../sketch/planes.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";
import type { EntityViewer } from "./entity-viewer.js";
import type { PlaneReferencePicker } from "./plane-reference-picker.js";
import type { Projection, ProjectionSource } from "./projection.js";
import { sourceProjectionNormal } from "./projection-direction.js";
import { ProjectionInput } from "./projection-input.js";
import { projectionKey, projectionSelection, projectionSource } from "./projection-selection.js";
import { ProjectionSourceView } from "./projection-source-view.js";

export class ProjectionControls {
  private disposeTool: () => void;
  private root = document.createElement("div");
  private input: ProjectionInput;
  private view: ProjectionSourceView;
  private lease: InteractionLease | null = null;
  private sources: ProjectionSource[] = [];
  private previousSelection: SketchEditor["selected"]["targets"] = [];
  private previousModels: SketchEditor["modeling"]["targets"] = [];
  private target: { frame: PlaneFrame; sketchId?: string } | null = null;
  private result: Sketch | null = null;
  private direction: "target-normal" | "source-normal" = "target-normal";
  private hover: ProjectionSource | null = null;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
    private picker: PlaneReferencePicker,
    private entities: EntityViewer,
  ) {
    this.disposeTool = toolCatalog(editor).register({
      id: "project",
      label: "Project",
      category: "Reference",
      aliases: ["projection"],
      description: "Project faces, edges or curves onto a plane",
      reason: () => idleReason(editor),
      run: () => this.begin(),
    });
    this.root.className = "model-actions projection-actions";
    this.root.innerHTML =
      '<button data-project="target-normal" aria-label="Project along target normal" title="Cast perpendicular to the destination plane">Target normal</button><button data-project="source-normal" aria-label="Project along source normal" title="Cast perpendicular to the source plane">Source normal</button><button data-project="accept" aria-label="Accept projection" title="Accept projection (Enter)">✓</button><button data-project="cancel" aria-label="Cancel projection" title="Cancel projection (Escape)">×</button>';
    overlay.append(this.root);
    this.view = new ProjectionSourceView(editor);
    this.root.onclick = (event) => {
      const action = (event.target as HTMLElement).closest("button")?.dataset.project;
      if (editor.blocked && action !== "cancel") return;
      if (action === "accept") void this.accept();
      else if (action === "cancel") void this.cancel();
      else if (action === "target-normal" || action === "source-normal") {
        this.direction = action;
        editor.message = "";
        void this.preview();
      }
    };
    this.input = new ProjectionInput(
      editor,
      () => !!this.lease,
      () => !!editor.world.active || !this.sources.length,
      (source) => this.toggle(source),
      (source) => this.hoverSource(source),
      () => void this.accept(),
      () => void this.cancel(),
    );
    editor.world.changed.add(this.update);
    this.update();
  }
  async reopen(projection: Projection): Promise<void> {
    await this.begin(projection);
    if (!this.lease || !this.result) throw new Error("Cannot regenerate the accepted projection");
    this.editor.world.canvas.focus();
  }
  private async begin(restored?: Projection): Promise<void> {
    const e = this.editor;
    if (e.blocked || e.interactions.current) return;
    this.sources = restored ? [...structuredClone(restored.sources)] : projectionSelection(e);
    this.previousSelection = e.selected.targets;
    this.previousModels = e.modeling.targets;
    await e.numeric.commit();
    this.lease = e.interactions.acquire("projection", () => this.cancel(), undefined, {
      navigation: "when-released",
    });
    if (!this.lease) return;
    this.target = restored
      ? { frame: structuredClone(restored.frame), sketchId: restored.sketchId }
      : e.world.activeFrame
        ? this.destination(e.world.activeFrame, e.sketch?.id)
        : null;
    e.message = "";
    this.direction = restored?.direction ?? "target-normal";
    if (restored)
      this.lease.trackHistory(
        this.root,
        () => ({ sources: this.sources, target: this.target, direction: this.direction }),
        async (saved) => {
          const state = structuredClone(saved);
          this.sources = state.sources;
          this.target = state.target;
          this.direction = state.direction;
          this.hover = null;
          this.view.show(this.sources, null);
          this.configurePicker();
          await this.preview();
          e.refresh();
        },
      );
    this.entities.sourcePicker = {
      choose: (target) => this.toggle(projectionSource(target)),
      hover: (target) => this.hoverSource(target ? projectionSource(target) : null),
      selected: (target) =>
        this.sources.some((s) => projectionKey(s) === projectionKey(projectionSource(target))),
    };
    this.configurePicker();
    e.select([]);
    this.view.show(this.sources, null);
    await this.preview();
    e.refresh();
  }
  private configurePicker(): void {
    if (this.editor.world.active || !this.sources.length) {
      this.picker.stop();
      return;
    }
    this.picker.start(
      (frame) => {
        if (this.editor.blocked || this.lease?.phase !== "editing") return;
        this.lease.history?.checkpoint();
        this.target = this.destination(frame);
        this.hover = null;
        this.view.show(this.sources, null);
        this.editor.message = "";
        void this.preview();
      },
      undefined,
      () => {
        this.editor.message = "Click a coordinate plane, construction plane or planar face";
        this.editor.refresh();
      },
      (event) => !event.shiftKey,
    );
  }
  private destination(
    frame: PlaneFrame,
    sketchId?: string,
  ): { frame: PlaneFrame; sketchId: string } {
    const e = this.editor;
    const visible = e.store.data.sketches.find(
      (sketch) => e.visibility.visible(sketch.id) && coplanar(sketch.plane, frame),
    );
    // An explicit new ID prevents the backend from reusing a hidden coplanar sketch.
    return { frame, sketchId: sketchId ?? visible?.id ?? newId() };
  }
  private toggle(source: ProjectionSource): void {
    const e = this.editor;
    if (!this.lease || e.blocked) return;
    this.lease.history?.checkpoint();
    const key = projectionKey(source);
    this.sources = this.sources.some((s) => projectionKey(s) === key)
      ? this.sources.filter((s) => projectionKey(s) !== key)
      : [...this.sources, source];
    e.message = "";
    this.hover = null;
    this.view.show(this.sources, null);
    this.configurePicker();
    void this.preview();
  }
  private hoverSource(source: ProjectionSource | null): void {
    if (!this.lease || projectionKeyOrEmpty(source) === projectionKeyOrEmpty(this.hover)) return;
    this.hover = source;
    this.view.show(this.sources, source);
    this.editor.refresh();
  }
  private async preview(): Promise<void> {
    const e = this.editor,
      lease = this.lease;
    this.result = null;
    lease?.show(null);
    if (!lease) return;
    if (!this.target || !this.sources.length) {
      if (e.store.candidate) await e.store.request({ kind: "discard" });
      e.refresh();
      return;
    }
    const ok = await e.store.request({
      kind: "project",
      projection: { ...this.target, sources: this.sources, direction: this.direction },
    });
    if (this.lease !== lease || lease.phase !== "editing") return;
    if (ok) {
      const candidate = e.store.candidate;
      this.result =
        candidate?.sketches.find(
          (s) =>
            !e.store.data.sketches.includes(s) &&
            JSON.stringify(s) !==
              JSON.stringify(e.store.data.sketches.find((old) => old.id === s.id)),
        ) ?? null;
      lease.show(candidate);
    }
    e.refresh();
  }
  private async accept(): Promise<void> {
    const e = this.editor,
      result = this.result,
      lease = this.lease;
    if (!result || !lease || e.blocked || !lease.close()) return;
    const old = new Set(
      e.store.data.sketches.find((s) => s.id === result.id)?.curves.map((c) => c.id),
    );
    const ok = await e.accept();
    if (ok) e.world.navigation.beginWorkspace();
    this.finish();
    if (ok) {
      e.workspaceEntry.enter({ key: "Projected sketch", frame: result.plane, sketchId: result.id });
      e.select(result.curves.filter((c) => !old.has(c.id)).map((c) => c.id));
      e.tool = "select";
      e.notice = "Projected independent curves · cubic approximation within 0.001 mm where needed";
      e.refresh();
    }
  }
  private async cancel(): Promise<void> {
    const lease = this.lease;
    if (!lease?.close()) return;
    await this.editor.store.cancelPreview();
    this.editor.message = "";
    this.finish();
    this.editor.selectTargets(this.previousSelection);
    this.editor.modeling.targets = this.previousModels;
    this.editor.refresh();
  }
  private finish(): void {
    const lease = this.lease;
    this.lease = null;
    this.sources = [];
    this.result = null;
    this.target = null;
    this.hover = null;
    this.entities.sourcePicker = null;
    this.view.clear();
    this.picker.stop();
    this.editor.notice = "";
    this.editor.modeling.hover = null;
    lease?.release();
  }
  private update = (): void => {
    const e = this.editor;
    this.root.hidden = !this.lease;
    for (const b of this.root.querySelectorAll<HTMLButtonElement>("button")) {
      b.disabled =
        (e.blocked && b.dataset.project !== "cancel") ||
        (b.dataset.project === "accept" && !this.result) ||
        (b.dataset.project === "source-normal" &&
          !sourceProjectionNormal(e.store.data, this.sources));
      if (b.dataset.project?.endsWith("normal"))
        b.setAttribute("aria-pressed", String(b.dataset.project === this.direction));
      if (b.dataset.project === "source-normal")
        b.title = sourceProjectionNormal(e.store.data, this.sources)
          ? "Cast perpendicular to the source plane"
          : "Available for planar sources sharing a normal";
    }
    if (this.lease)
      e.notice = this.result
        ? e.world.active
          ? "Enter accepts · Click geometry to change sources · Escape cancels"
          : "Enter accepts · Escape cancels · Shift-click changes sources"
        : e.world.active || !this.sources.length
          ? "Click a face, filled region or curve, or choose geometry in Entities · Escape cancels"
          : "Click a plane to project onto · Shift-click or Entities changes sources · Escape cancels";
    if (this.lease) this.view.show(this.sources, this.hover);
  };
  dispose(): void {
    void this.cancel();
    this.input.dispose();
    this.editor.world.changed.delete(this.update);
    this.root.remove();
    this.disposeTool();
    this.view.dispose();
  }
}

const projectionKeyOrEmpty = (source: ProjectionSource | null) =>
  source ? projectionKey(source) : "";
