import { guidePlaneReason, selectedGuides } from "../guides/selection.js";
import type { InteractionLease } from "../sketch/active-interaction.js";
import { newId } from "../sketch/document.js";
import type { SketchEditor } from "../sketch/editor.js";
import { type PlaneFrame, type PlaneId, planes } from "../sketch/planes.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";
import { type ConstructionPlane, withConstructionPlane } from "./construction-plane.js";
import { installConstructionPlaneEvents } from "./construction-plane-events.js";
import { constructionPlaneReference } from "./construction-plane-reference.js";
import { ConstructionPlaneView } from "./construction-plane-view.js";
import { PlanePlacement } from "./plane-placement.js";
import { PlaneReferencePicker } from "./plane-reference-picker.js";
import { planeSelectionKey } from "./plane-selection-key.js";
import { selectReferencePlane } from "./reference-plane-selection.js";
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
      finishEdit: true,
      label: "Construction plane",
      category: "Reference",
      aliases: ["workplane", "reference plane"],
      reason: () =>
        idleReason(editor) ??
        guidePlaneReason(editor) ??
        (editor.world.active && !selectedGuides(editor).size ? "Return to Modeling first" : null),
      run: () => this.create(),
    });
    this.placement = new PlanePlacement(
      editor,
      overlay,
      () => {
        const plane = this.plane ?? this.selected();
        return plane ? { frame: plane.frame, lease: this.lease, id: plane.id } : null;
      },
      (frame) => {
        if (!frame) {
          this.valid = false;
          editor.refresh();
          return;
        }
        this.valid = true;
        this.preview(frame);
      },
      () => {
        const plane = this.selected();
        if (plane) this.begin(plane);
      },
      () => this.finish(),
      true,
    );
    savedPlaneInteraction(
      editor,
      this.abort.signal,
      (plane) => this.select(plane),
      (id) => this.view.hover(id),
      (plane) => this.sketch(plane),
    );
    installConstructionPlaneEvents(
      editor,
      this.abort.signal,
      () => !!this.lease,
      () => !!this.picker.choose,
      {
        cancel: () => this.cancel(),
        finish: () => this.finish(),
        selectedKey: (event) => this.selectedKey(event),
        clear: () => {
          this.view.selected = null;
          editor.world.selectedPlane = null;
          editor.refresh();
        },
      },
    );
    editor.world.planeSelection = (id, entering) => this.select(id, entering);
    editor.world.changed.add(this.update);
    this.update();
  }
  selected(): ConstructionPlane | undefined {
    return this.editor.store.data.constructionPlanes?.find((p) => p.id === this.view.selected);
  }
  selectedFrame(): PlaneFrame | undefined {
    const id = this.editor.world.selectedPlane;
    return id ? planes[id] : this.selected()?.frame;
  }
  transform(): void {
    this.editor.modeling.setTool("move");
    this.editor.refresh();
  }
  private selectedKey(event: KeyboardEvent): void {
    if (this.editor.interactions.current) return;
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
  async select(plane: ConstructionPlane | PlaneId, entering?: () => boolean): Promise<void> {
    await selectReferencePlane(this.editor, this.picker, this.view, plane, entering);
    if (typeof plane !== "string" && this.selected()) {
      this.editor.modeling.setTool("move");
      this.editor.refresh();
    }
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
    if (e.blocked || e.interactions.current) return;
    const frame = constructionPlaneReference(e, this.selectedFrame());
    if (!frame) return this.begin();
    await this.place(frame);
  }
  private async place(frame: PlaneFrame): Promise<void> {
    const plane = { id: newId(), frame };
    if (await this.editor.store.request({ kind: "construction-plane", plane })) {
      selectedGuides(this.editor).clear();
      if (this.editor.world.active) this.editor.world.exit();
      this.editor.modeling.targets = [];
      this.editor.world.selectedPlane = null;
      this.view.selected = plane.id;
      this.editor.modeling.setTool("move");
      this.editor.refresh();
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
  private begin(existing?: ConstructionPlane): void {
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
    this.plane = existing ? structuredClone(existing) : null;
    e.modeling.setTool("move");
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
    if (!existing)
      this.picker.start(
        (frame) => {
          this.plane = { id: newId(), frame };
          this.valid = true;
          this.preview(frame);
          this.picker.stop();
          void this.finish();
        },
        undefined,
        () => void this.finish(),
      );
    e.notice = existing
      ? "Move plane · Enter accepts · Escape cancels"
      : "Construction plane · Pick a world plane, plane or planar face";
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
    await toolCatalog(this.editor).activate({
      reason: () => null,
      run: async () => {
        const plane = this.selected();
        if (!plane) return;
        await this.editor.store.request({ kind: "delete-plane", id: plane.id });
        this.view.selected = null;
        this.editor.refresh();
      },
    });
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
