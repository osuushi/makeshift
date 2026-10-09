import { ExtrudeControls } from "../model/extrude-controls.js";
import { LoftControls } from "../model/loft-controls.js";
import { ModelSelectionDrag } from "../model/model-selection-drag.js";
import { RevolveControls } from "../model/revolve-controls.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";
import type { SketchEditor } from "./editor.js";
import { modelDoubleClick } from "./model-double-click.js";
import { onModelKeydown } from "./model-keys.js";
import { modelingSketch, pickModel, pickModels } from "./model-selection.js";
import type { ModelingTarget } from "./model-selection-state.js";
import { PlacementControls } from "./placement-controls.js";

export class ModelControls {
  private disposers: (() => void)[] = [];
  private abort = new AbortController();
  private placement: PlacementControls;
  private revolve: RevolveControls;
  private loft: LoftControls;
  private extrusion: ExtrudeControls;
  private selectionDrag: ModelSelectionDrag;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.registerTools();
    this.placement = new PlacementControls(editor, overlay);
    this.revolve = new RevolveControls(editor, overlay);
    this.loft = new LoftControls(editor, overlay);
    this.extrusion = new ExtrudeControls(editor, overlay);
    this.selectionDrag = new ModelSelectionDrag(
      editor,
      overlay,
      () =>
        !toolCatalog(editor).switching &&
        !this.extrusion.active &&
        (!editor.interactions.current || editor.interactions.current.kind === "tag-membership"),
    );
    const options = { signal: this.abort.signal },
      canvas = editor.world.canvas;
    this.bindCanvas(canvas, options);
    modelDoubleClick(editor, overlay, this.abort.signal, (event, before) =>
      this.doubleClick(event, before),
    );
    this.installKeys(options);
  }
  private registerTools(): void {
    const editor = this.editor,
      catalog = toolCatalog(editor);
    const base = () =>
      idleReason(editor) ?? (editor.world.active ? "Return to Modeling first" : null);
    const sketch = () =>
      base() ?? (modelingSketch(editor) ? null : "Select a sketch or its filled region");
    this.disposers.push(
      catalog.register({
        id: "edit-sketch",
        finishEdit: true,
        label: "Edit sketch",
        category: "Sketch",
        aliases: ["open sketch"],
        reason: sketch,
        run: () => this.enter(),
      }),
      catalog.register({
        id: "new-sketch-on-plane",
        finishEdit: true,
        label: "New sketch on this plane",
        category: "Sketch",
        aliases: ["new sketch", "same plane"],
        reason: sketch,
        run: () => this.enter(true),
      }),
      catalog.register({
        id: "sketch-on-face",
        finishEdit: true,
        label: "Sketch on face",
        category: "Sketch",
        shortcut: "Enter",
        reason: () => {
          const target = editor.modeling.targets.length === 1 ? editor.modeling.targets[0] : null;
          const face =
            target?.kind === "face"
              ? editor.display.bodies
                  ?.find((b) => b.id === target.body)
                  ?.faces.find((f) => f.id === target.face)
              : undefined;
          return base() ?? (face?.plane ? null : "Select one planar solid face");
        },
        run: () => this.enter(),
      }),
      catalog.register({
        id: "select-face",
        finishEdit: true,
        label: "Select face",
        category: "Select",
        description: "Choose the solid face underneath the selected sketch region",
        reason: () =>
          base() ??
          (modelingSketch(editor) && editor.modeling.alternatives.some((t) => t.kind === "face")
            ? null
            : "Select a sketch region overlapping a solid face"),
        run: () => {
          const face = editor.modeling.alternatives.find((t) => t.kind === "face");
          if (!face) return;
          editor.modeling.choose(face, false, false);
          editor.modeling.alternatives = [];
          editor.refresh();
        },
      }),
    );
  }
  private bindCanvas(canvas: HTMLCanvasElement, options: AddEventListenerOptions): void {
    const editor = this.editor;
    canvas.addEventListener(
      "pointermove",
      (event) => {
        if (
          editor.world.active ||
          toolCatalog(editor).switching ||
          editor.isDragging ||
          editor.blocked ||
          this.extrusion.active ||
          [
            "loft",
            "revolve",
            "body-move",
            "body-boolean",
            "body-edge-finish",
            "face-offset",
          ].includes(editor.interactions.current?.kind ?? "")
        )
          return;
        editor.modeling.hover = pickModel(editor, { x: event.clientX, y: event.clientY });
        editor.refresh();
      },
      options,
    );
    canvas.addEventListener(
      "click",
      async (event) => {
        if (
          editor.world.active ||
          ["body-move", "placement"].includes(editor.interactions.current?.kind ?? "")
        )
          return;
        await toolCatalog(editor).activate({
          reason: () => null,
          run: () => {
            const hits = pickModels(editor, { x: event.clientX, y: event.clientY });
            editor.modeling.alternatives = hits.slice(1);
            editor.modeling.choose(hits[0] ?? null, event.shiftKey, event.metaKey || event.ctrlKey);
            this.placement.enabled = false;
            editor.refresh();
          },
        });
      },
      options,
    );
  }
  private doubleClick(event: MouseEvent, before: ModelingTarget[]): void {
    const editor = this.editor;
    if (
      toolCatalog(editor).switching ||
      editor.world.active ||
      editor.blocked ||
      editor.isDragging ||
      editor.interactions.current
    )
      return;
    const target = pickModel(editor, { x: event.clientX, y: event.clientY });
    if (target?.kind === "face" || target?.kind === "edge" || target?.kind === "body") {
      editor.modeling.targets = before;
      editor.modeling.choose(
        { kind: "body", body: target.body },
        event.shiftKey,
        event.metaKey || event.ctrlKey,
      );
      editor.modeling.alternatives = [];
      this.placement.enabled = false;
      editor.refresh();
    } else if (target && !event.shiftKey && !event.metaKey && !event.ctrlKey)
      void toolCatalog(editor).invoke("edit-sketch");
  }
  private installKeys(options: { signal: AbortSignal }): void {
    const editor = this.editor;
    onModelKeydown((event) => {
      if (
        editor.world.active ||
        toolCatalog(editor).switching ||
        event.target instanceof HTMLInputElement ||
        editor.interactions.current?.captured
      )
        return;
      if (
        event.key === "Enter" &&
        !event.defaultPrevented &&
        !editor.interactions.current &&
        editor.modeling.targets.length === 1 &&
        ["face", "sketch"].includes(editor.modeling.targets[0]?.kind ?? "") &&
        (!(event.target instanceof HTMLButtonElement) ||
          event.target.classList.contains("entity-label")) &&
        !(event.target instanceof HTMLSelectElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault();
        void toolCatalog(editor).invoke(
          editor.modeling.targets[0]?.kind === "face" ? "sketch-on-face" : "edit-sketch",
        );
      }
      if (event.key === "Escape") {
        // An operation owns its own cancellation and keeps its selection. This
        // listener otherwise runs before the shared Escape shortcut below.
        if (editor.interactions.current) {
          event.preventDefault();
          event.stopImmediatePropagation();
          editor.interactions.requestCancel();
          return;
        }
        this.placement.enabled = false;
        editor.modeling.targets = [];
        editor.refresh();
      }
    }, options);
  }
  reopenRevolve(revolution: import("../model/body.js").Revolution): Promise<void> {
    return this.revolve.reopen(revolution);
  }
  reopenLoft(operation: import("../model/loft.js").Loft): Promise<void> {
    return this.loft.reopen(operation);
  }
  reopenExtrude(extrusion: import("../model/body.js").Extrusion): Promise<void> {
    return this.extrusion.reopen(extrusion);
  }
  activateLoft(): void {
    this.loft.begin();
  }
  activateRevolve(): void {
    this.revolve.begin();
  }
  move(): void {
    const sketch = modelingSketch(this.editor);
    if (sketch) this.editor.modeling.targets = [{ kind: "sketch", sketch: sketch.id }];
    else if (
      !this.editor.modeling.targets.length ||
      this.editor.modeling.targets.some((t) => t.kind !== "sketch")
    )
      return;
    this.placement.enabled = true;
    this.editor.refresh();
  }
  private enter(fresh = false): boolean {
    if (!this.editor.workspaceEntry.selected(fresh)) return false;
    this.placement.enabled = false;
    return true;
  }
  dispose(): void {
    for (const dispose of this.disposers) dispose();
    this.abort.abort();
    this.placement.dispose();
    this.extrusion.dispose();
    this.selectionDrag.dispose();
    this.revolve.dispose();
    this.loft.dispose();
  }
}
