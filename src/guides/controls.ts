import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import { toolCatalog } from "../tools/catalog.js";
import { GuideHighlight } from "./highlight.js";
import { hoverGuides } from "./hover.js";
import { type GuideMarker, GuideMarkers } from "./markers.js";
import { GuideMove } from "./move.js";
import { selectedGuides } from "./selection.js";
import { visibleGuides } from "./snapping.js";
import { surfaceDragActive, surfaceDragTargets } from "./surface-snap.js";
import { type GuideAnchor, type GuidePoint, guideKey, guideMeaning, guideOwner } from "./types.js";
import { editingGuides, toggleGuideEditing } from "./view-state.js";
import "./style.css";
import type { GuideToolInput } from "./tool-path.js";

export class GuideControls {
  get selected(): Set<string> {
    return selectedGuides(this.editor);
  }
  private selectedWith = "";
  private hovered: readonly GuideAnchor[] | null = null;
  private highlight: GuideHighlight;
  private markers: GuideMarkers;
  private movement: GuideMove;
  private abort = new AbortController();
  private unregister: () => void;
  private pointer: { x: number; y: number } | null = null;
  constructor(
    private editor: SketchEditor,
    host: HTMLElement,
    toolInput: GuideToolInput = () => null,
  ) {
    this.highlight = new GuideHighlight(editor);
    this.movement = new GuideMove(editor, host, toolInput);
    this.markers = new GuideMarkers(
      editor,
      host,
      (item, additive) => void this.choose(item, additive),
      (items) => this.hover(items?.map((p) => p.anchor) ?? null),
      (event, item) => this.drag(event, item),
      () => this.selected,
    );
    this.unregister = toolCatalog(editor).register({
      id: "guide-points",
      label: "Edit Guide Points",
      category: "View",
      description: "Turn guide point candidates on or off; saved guides remain visible",
      aliases: ["points of interest", "snap points", "centroid"],
      shortcut: "G",
      finishEdit: false,
      reason: () => null,
      run: () => {
        this.selected.clear();
        this.hovered = null;
        this.markers.closeChoices();
        toggleGuideEditing(editor);
      },
    });
    window.addEventListener(
      "pointermove",
      (event) => {
        this.pointer = { x: event.clientX, y: event.clientY };
        this.update();
      },
      { capture: true, signal: this.abort.signal },
    );
    const clearPointer = () => {
      this.pointer = null;
      this.hovered = null;
      this.update();
    };
    window.addEventListener("blur", clearPointer, { signal: this.abort.signal });
    document.documentElement.addEventListener("pointerleave", clearPointer, {
      signal: this.abort.signal,
    });
    editor.world.canvas.addEventListener(
      "pointerdown",
      () => {
        this.selected.clear();
        this.hovered = null;
        this.markers.closeChoices();
      },
      { capture: true, signal: this.abort.signal },
    );
    this.bindKeys();
    editor.world.changed.add(this.update);
  }
  private bindKeys(): void {
    const editor = this.editor;
    onModelKeydown(
      (event) => {
        if (
          event.target instanceof Element &&
          event.target.closest("input,textarea,[contenteditable]")
        )
          return;
        if (
          event.key.toLowerCase() === "g" &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          !event.repeat &&
          !event.isComposing
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (surfaceDragActive(editor)) toggleGuideEditing(editor);
          else void toolCatalog(editor).invoke("guide-points");
        } else if (event.key === "Escape" && this.selected.size && !editor.interactions.current) {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.selected.clear();
          editor.refresh();
        } else if (
          this.selected.size &&
          !editor.interactions.current &&
          ["Delete", "Backspace"].includes(event.key)
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();
          void this.remove([...this.selected]);
        }
      },
      { capture: true, signal: this.abort.signal },
    );
  }
  private async choose(item: GuideMarker, additive = false): Promise<void> {
    if (this.editor.blocked) return;
    if (item.guide) {
      this.select(item.guide, additive);
      return;
    }
    if (this.editor.interactions.current) return;
    if (
      await this.editor.store.request({
        kind: "guide-point",
        edit: { action: "create", anchor: item.anchor },
      })
    ) {
      const saved = this.editor.store.data.guidePoints?.find(
        (p) => guideKey(p.anchor) === guideKey(item.anchor),
      );
      if (saved) this.select(saved, additive);
    }
  }
  select(guide: GuidePoint, additive = false): void {
    const remove = additive && this.selected.has(guide.id);
    if (!additive) this.selected.clear();
    if (remove) this.selected.delete(guide.id);
    else this.selected.add(guide.id);
    this.selectedWith = this.selectionKey();
    this.editor.notice = `${guide.name} · ${guideMeaning(guide.anchor)}`;
    this.editor.refresh();
  }
  hover(anchor: GuideAnchor | readonly GuideAnchor[] | null): void {
    this.hovered = anchor ? (Array.isArray(anchor) ? anchor : [anchor as GuideAnchor]) : null;
    this.update();
    this.editor.world.draw();
  }
  async remove(id: string | string[]): Promise<void> {
    await toolCatalog(this.editor).activate({
      reason: () => null,
      run: () =>
        this.editor.store.request({
          kind: "guide-point",
          edit:
            typeof id === "string" ? { action: "remove", id } : { action: "remove-many", ids: id },
        }),
    });
  }
  private drag(event: PointerEvent, item: GuideMarker): void {
    this.movement.start(event, item);
  }
  private update = (): void => {
    const e = this.editor;
    const surfaceTargets = surfaceDragTargets(e);
    if (this.selected.size && this.selectedWith !== this.selectionKey()) this.selected.clear();
    const saved = visibleGuides(e, this.movement.toolActive || !!surfaceTargets).map(
      ({ guide, point }) => ({
        guide,
        point,
        anchor: guide.anchor,
        label: guideMeaning(guide.anchor),
      }),
    );
    const keys = new Set(saved.map((p) => guideKey(p.anchor)));
    let candidates: GuideMarker[] = [];
    if (editingGuides(e) && !e.interactions.current && (!e.world.active || e.tool === "select"))
      candidates = hoverGuides(e, this.pointer);
    candidates = candidates.filter(
      (p) =>
        !keys.has(guideKey(p.anchor)) &&
        e.visibility.visible(guideOwner(p.anchor)) &&
        (p.anchor.kind === "sketch-curve" || e.bodiesVisible),
    );
    const interactive = this.movement.interactive && (!e.world.active || e.tool === "select");
    this.markers.update(
      [...saved, ...candidates],
      interactive,
      (item) => !!surfaceTargets || this.movement.dragging || this.movement.canStart(item),
    );
    const selected = e.store.data.guidePoints?.filter((p) => this.selected.has(p.id)) ?? [];
    for (const id of this.selected)
      if (!selected.some((p) => p.id === id)) this.selected.delete(id);
    this.highlight.show(this.hovered ?? selected.map((p) => p.anchor));
  };
  private selectionKey(): string {
    const e = this.editor;
    return JSON.stringify([e.world.active, e.modeling.targets, [...e.selectionOwners]]);
  }
  dispose(): void {
    this.abort.abort();
    this.unregister();
    this.editor.world.changed.delete(this.update);
    this.markers.dispose();
    this.movement.dispose();
    this.highlight.dispose();
  }
}
