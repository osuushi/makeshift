import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import { toolCatalog } from "../tools/catalog.js";
import { GuideHighlight } from "./highlight.js";
import { hoverGuides } from "./hover.js";
import { type GuideMarker, GuideMarkers } from "./markers.js";
import { GuideMove } from "./move.js";
import { visibleGuides } from "./snapping.js";
import { type GuideAnchor, type GuidePoint, guideKey, guideMeaning, guideOwner } from "./types.js";
import { guidesVisible, toggleGuides } from "./view-state.js";
import "./style.css";

export class GuideControls {
  selected: string | null = null;
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
  ) {
    this.highlight = new GuideHighlight(editor);
    this.movement = new GuideMove(editor, host);
    this.markers = new GuideMarkers(
      editor,
      host,
      (item) => void this.choose(item),
      (items) => this.hover(items?.map((p) => p.anchor) ?? null),
      (event, item) => this.drag(event, item),
      () => this.selected,
      (item) => {
        if (item.guide) void this.remove(item.guide.id);
      },
    );
    this.unregister = toolCatalog(editor).register({
      id: "guide-points",
      label: "Guide points",
      category: "View",
      description: "Show or hide saved guides and nearby points of interest",
      aliases: ["points of interest", "snap points", "centroid"],
      shortcut: "G",
      finishEdit: false,
      reason: () => null,
      run: () => {
        this.selected = null;
        this.hovered = null;
        this.markers.choices.hidden = true;
        toggleGuides(editor);
      },
    });
    window.addEventListener(
      "pointermove",
      (event) => {
        if (event.target !== editor.world.canvas) return;
        this.pointer = { x: event.clientX, y: event.clientY };
        this.update();
      },
      { signal: this.abort.signal },
    );
    editor.world.canvas.addEventListener(
      "pointerdown",
      () => {
        this.selected = null;
        this.hovered = null;
        this.markers.choices.hidden = true;
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
          void toolCatalog(editor).invoke("guide-points");
        } else if (
          this.selected &&
          !editor.interactions.current &&
          ["Delete", "Backspace"].includes(event.key)
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();
          void this.remove(this.selected);
        }
      },
      { capture: true, signal: this.abort.signal },
    );
  }
  private async choose(item: GuideMarker): Promise<void> {
    if (this.editor.blocked) return;
    if (item.guide) {
      this.select(item.guide);
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
      if (saved) this.select(saved);
    }
  }
  select(guide: GuidePoint): void {
    this.selected = guide.id;
    this.selectedWith = this.selectionKey();
    this.editor.notice = `${guide.name} · ${guideMeaning(guide.anchor)}`;
    this.editor.refresh();
  }
  hover(anchor: GuideAnchor | readonly GuideAnchor[] | null): void {
    this.hovered = anchor ? (Array.isArray(anchor) ? anchor : [anchor as GuideAnchor]) : null;
    this.update();
    this.editor.world.draw();
  }
  async remove(id: string): Promise<void> {
    await toolCatalog(this.editor).activate({
      reason: () => null,
      run: () => this.editor.store.request({ kind: "guide-point", edit: { action: "remove", id } }),
    });
  }
  private drag(event: PointerEvent, item: GuideMarker): void {
    this.movement.start(event, item);
  }
  private update = (): void => {
    const e = this.editor;
    if (this.selected && this.selectedWith !== this.selectionKey()) this.selected = null;
    const saved = visibleGuides(e).map(({ guide, point }) => ({
      guide,
      point,
      anchor: guide.anchor,
      label: guideMeaning(guide.anchor),
    }));
    const keys = new Set(saved.map((p) => guideKey(p.anchor)));
    let candidates: GuideMarker[] = [];
    if (guidesVisible(e) && !e.interactions.current && (!e.world.active || e.tool === "select"))
      candidates = hoverGuides(e, this.pointer);
    candidates = candidates.filter(
      (p) =>
        !keys.has(guideKey(p.anchor)) &&
        e.visibility.visible(guideOwner(p.anchor)) &&
        (p.anchor.kind === "sketch-curve" || e.bodiesVisible),
    );
    const interactive = !e.interactions.current && (!e.world.active || e.tool === "select");
    this.markers.update([...saved, ...candidates], interactive);
    const selected = e.store.data.guidePoints?.find((p) => p.id === this.selected);
    if (!selected) this.selected = null;
    this.highlight.show(this.hovered ?? selected?.anchor ?? null);
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
