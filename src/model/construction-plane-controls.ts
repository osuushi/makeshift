import type { InteractionLease } from "../sketch/active-interaction.js";
import { newId } from "../sketch/document.js";
import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import { type PlaneFrame, type PlaneId, planes } from "../sketch/planes.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";
import { type ConstructionPlane, withConstructionPlane } from "./construction-plane.js";
import { ConstructionPlaneView } from "./construction-plane-view.js";
import { PlanePlacement } from "./plane-placement.js";
import { PlaneReferencePicker } from "./plane-reference-picker.js";
import { planeSelectionKey } from "./plane-selection-key.js";
import { savedPlaneInteraction } from "./saved-plane-picking.js";

export class ConstructionPlaneControls {
  readonly picker: PlaneReferencePicker;
  private view: ConstructionPlaneView;
  private placement: PlanePlacement;
  private disposeTool: () => void;
  private abort = new AbortController();
  private lease: InteractionLease | null = null;
  private plane: ConstructionPlane | null = null;
  private valid = true;
  private restoredSelection: SketchEditor["modeling"]["targets"] | undefined;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
    rows: HTMLElement,
  ) {
    this.picker = new PlaneReferencePicker(editor);
    this.view = new ConstructionPlaneView(
      editor,
      overlay,
      rows,
      (plane) => this.select(plane),
      (plane) => this.sketch(plane),
    );
    this.disposeTool = toolCatalog(editor).register({
      id: "construction-plane",
      label: "Construction plane",
      category: "Reference",
      aliases: ["workplane", "reference plane"],
      reason: () => idleReason(editor) ?? (editor.world.active ? "Return to Modeling first" : null),
      run: () => this.create(),
    });
    this.placement = new PlanePlacement(
      editor,
      overlay,
      () => (this.lease && this.plane ? { frame: this.plane.frame, lease: this.lease } : null),
      (frame) => {
        if (!frame) {
          this.valid = false;
          editor.refresh();
          return;
        }
        this.valid = true;
        this.preview(frame);
      },
    );
    savedPlaneInteraction(
      editor,
      this.abort.signal,
      (plane) => this.select(plane),
      (id) => this.view.hover(id),
      (plane) => this.sketch(plane),
    );
    this.bindEvents();
    editor.world.planeSelection = (id) => this.select(id);
    editor.world.changed.add(this.update);
    this.update();
  }
  private bindEvents(): void {
    const editor = this.editor;
    onModelKeydown(
      (event) => {
        if (this.lease) {
          if (event.key === "Escape" || event.key === "Enter") event.stopImmediatePropagation();
          if (event.key === "Escape") {
            event.preventDefault();
            this.cancel();
          }
          if (event.key === "Enter") {
            event.preventDefault();
            void this.finish();
          }
        } else this.selectedKey(event);
      },
      { capture: true, signal: this.abort.signal },
    );
    editor.world.canvas.addEventListener(
      "pointerdown",
      (event) => {
        if (
          !this.lease &&
          !this.picker.choose &&
          !event.button &&
          !event.metaKey &&
          !event.ctrlKey
        ) {
          this.view.selected = null;
          editor.world.selectedPlane = null;
          editor.refresh();
        }
      },
      { signal: this.abort.signal },
    );
  }
  selected(): ConstructionPlane | undefined {
    return this.editor.store.data.constructionPlanes?.find((p) => p.id === this.view.selected);
  }
  selectedFrame(): PlaneFrame | undefined {
    const id = this.editor.world.selectedPlane;
    return id ? planes[id] : this.selected()?.frame;
  }
  transform(): void {
    const plane = this.selected();
    if (plane) this.begin(plane);
  }
  private selectedKey(event: KeyboardEvent): void {
    const plane = this.selected();
    const world = this.editor.world,
      id = world.selectedPlane;
    if (!plane && !id) return;
    planeSelectionKey(this.editor, event, {
      enter: () => (id ? world.sketchEntry?.(id) : plane && this.sketch(plane)),
      remove: plane ? () => void this.remove() : undefined,
      clear: () => {
        world.selectedPlane = null;
        this.view.selected = null;
        this.editor.refresh();
      },
    });
  }
  select(plane: ConstructionPlane | PlaneId): void {
    if (this.editor.blocked) return;
    if (this.picker.choose) {
      this.picker.choose(structuredClone(typeof plane === "string" ? planes[plane] : plane.frame));
      return;
    }
    if (this.editor.interactions.current) return;
    this.editor.world.exit();
    this.editor.modeling.targets = [];
    this.view.selected = typeof plane === "string" ? null : plane.id;
    this.editor.world.selectedPlane = typeof plane === "string" ? plane : null;
    this.editor.modeling.alternatives = [];
    this.editor.refresh();
  }
  private sketch(plane: ConstructionPlane): void {
    if (this.editor.workspaceEntry.reason()) return;
    this.view.selected = null;
    this.editor.workspaceEntry.enter({
      key: "Construction plane",
      frame: structuredClone(plane.frame),
    });
  }
  private async create(): Promise<void> {
    const e = this.editor;
    if (e.blocked || e.interactions.current || e.world.active) return;
    const selected = e.modeling.targets;
    const reference = this.selectedFrame();
    if (reference) return this.begin(undefined, structuredClone(reference));
    const target = selected.length === 1 ? selected[0] : undefined;
    const frame =
      target?.kind === "face"
        ? e.store.data.bodies
            ?.find((b) => b.id === target.body)
            ?.faces.find((f) => f.id === target.face)?.plane
        : null;
    if (!frame) return this.begin();
    const plane = { id: newId(), frame: structuredClone(frame) };
    if (await e.store.request({ kind: "construction-plane", plane })) {
      e.modeling.targets = [];
      this.view.selected = plane.id;
      e.refresh();
    }
  }
  async reopen(plane: ConstructionPlane): Promise<void> {
    const selection = structuredClone(this.editor.modeling.targets);
    this.begin(plane);
    if (!this.lease) throw new Error("Cannot restore construction plane");
    this.restoredSelection = selection;
    this.editor.notice =
      "Reopened construction plane · Recorded frame restored; handles add movement";
    this.editor.world.canvas.focus();
    this.editor.refresh();
  }
  private begin(existing?: ConstructionPlane, reference?: PlaneFrame): void {
    const e = this.editor;
    if (e.blocked || e.interactions.current || e.world.active) return;
    this.lease = e.interactions.acquire(
      "construction-plane",
      () => this.cancel(),
      () => this.finish(),
      { navigation: "when-released" },
    );
    if (!this.lease) return;
    e.modeling.targets = [];
    e.world.selectedPlane = null;
    this.plane = existing
      ? structuredClone(existing)
      : reference
        ? { id: newId(), frame: reference }
        : null;
    this.valid = true;
    this.placement.reset();
    this.lease.trackHistory(
      this.placement.root,
      () => this.plane,
      (plane) => {
        this.plane = plane;
        this.valid = true;
        this.placement.reset();
        if (plane) this.preview(plane.frame);
        else {
          this.lease?.show(null);
          e.refresh();
        }
      },
    );
    this.picker.start(
      (frame) => {
        this.placement.reset();
        this.plane = { id: this.plane?.id ?? newId(), frame };
        this.valid = true;
        this.preview(frame);
      },
      undefined,
      () => void this.finish(),
    );
    e.notice = "Construction plane · Pick a world plane, plane or planar face · Enter accepts";
    if (this.plane) this.preview(this.plane.frame);
    else e.refresh();
  }
  private preview(frame: PlaneFrame): void {
    if (!this.lease || !this.plane) return;
    this.plane = { ...this.plane, frame };
    this.view.selected = this.plane.id;
    this.lease.show(withConstructionPlane(this.editor.store.data, this.plane));
    this.editor.message = "";
    this.editor.refresh();
  }
  private async finish(): Promise<boolean> {
    if (!this.plane) {
      this.cancel();
      return true;
    }
    if (!this.valid || !this.lease?.close()) return false;
    const success = await this.editor.store.request({
      kind: "construction-plane",
      plane: this.plane,
    });
    if (!success) {
      this.lease.phase = "editing";
      this.editor.refresh();
      return false;
    }
    this.end();
    return true;
  }
  private cancel(): void {
    if (this.lease?.close()) {
      if (this.restoredSelection) this.editor.modeling.targets = this.restoredSelection;
      this.end();
    }
  }
  private end(): void {
    const lease = this.lease;
    this.lease = null;
    this.plane = null;
    this.restoredSelection = undefined;
    this.picker.stop();
    this.placement.reset();
    this.editor.notice = "";
    lease?.release();
    this.editor.refresh();
  }
  private async remove(): Promise<void> {
    const plane = this.selected();
    if (!plane || this.editor.blocked || this.editor.interactions.current) return;
    await this.editor.store.request({ kind: "delete-plane", id: plane.id });
    this.view.selected = null;
    this.editor.refresh();
  }
  private update = (): void => {
    const e = this.editor;
    if ((e.modeling.targets.length || e.world.active) && !this.lease) this.view.selected = null;
    if (!e.display.constructionPlanes?.some((p) => p.id === this.view.selected))
      this.view.selected = null;
    this.view.choosing = !!this.picker.choose;
    this.view.accepts = this.picker.accepts;
    this.view.update();
    this.placement.update();
  };
  dispose(): void {
    this.cancel();
    this.abort.abort();
    this.editor.world.planeSelection = null;
    this.editor.world.selectedPlane = null;
    this.editor.world.changed.delete(this.update);
    this.picker.dispose();
    this.view.dispose();
    this.placement.dispose();
    this.disposeTool();
  }
}
