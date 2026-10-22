import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import type { ModelingTarget } from "../sketch/model-selection-state.js";
import { hitIds } from "../sketch/sketch-hit.js";
import { toolCatalog } from "../tools/catalog.js";
import { commonGuide, guideCandidates } from "./candidates.js";
import { GuideHighlight } from "./highlight.js";
import { type GuideMarker, GuideMarkers } from "./markers.js";
import { visibleGuides } from "./snapping.js";
import { type GuideAnchor, type GuidePoint, guideKey, guideMeaning, guideOwner } from "./types.js";
import "./style.css";

export class GuideControls {
  selected: string | null = null;
  private selectedWith = "";
  private hovered: GuideAnchor | null = null;
  private highlight: GuideHighlight;
  private markers: GuideMarkers;
  private abort = new AbortController();
  private unregister: () => void;
  private lease: InteractionLease | null = null;
  private targets: ModelingTarget[] = [];
  private curves: { sketch: string; curves: string[] } | undefined;
  private pointer: { x: number; y: number } | null = null;
  private ghosts: GuideMarker[] = [];
  private pressedGhosts: GuideMarker[] = [];
  private panel = document.createElement("div");
  constructor(
    private editor: SketchEditor,
    host: HTMLElement,
    private moveGuide: (event: PointerEvent, item: GuideMarker) => void,
  ) {
    this.highlight = new GuideHighlight(editor);
    this.markers = new GuideMarkers(
      editor,
      host,
      (item) => void this.choose(item),
      (item) => this.hover(item?.anchor ?? null),
      (event, item) => this.drag(event, item),
      () => this.selected,
    );
    this.panel.className = "guide-tool";
    this.panel.hidden = true;
    this.panel.innerHTML =
      "<strong>Guide points</strong><span>Click a point to keep it. Overlapping points offer a choice.</span><button>Done</button>";
    this.panel.querySelector("button")?.addEventListener("click", () => this.finish());
    host.append(this.panel);
    this.unregister = toolCatalog(editor).register({
      id: "guide-points",
      label: "Guide points",
      category: "Reference",
      description: "Keep endpoints, midpoints and centers attached to selected geometry",
      aliases: ["points of interest", "snap points", "centroid"],
      reason: () =>
        this.selectionCandidates().length ? null : "Select a body, face, edge or sketch curve",
      run: () => this.begin(),
    });
    window.addEventListener(
      "pointermove",
      (event) => {
        if (event.target !== editor.world.canvas) return;
        this.pressedGhosts = [];
        this.pointer = { x: event.clientX, y: event.clientY };
        this.update();
      },
      { signal: this.abort.signal },
    );
    editor.world.canvas.addEventListener(
      "pointerdown",
      () => {
        if (this.ghosts.length) this.pressedGhosts = this.ghosts;
        this.selected = null;
        this.hovered = null;
        this.markers.choices.hidden = true;
      },
      { capture: true, signal: this.abort.signal },
    );
    editor.world.canvas.addEventListener(
      "dblclick",
      (event) => {
        if (
          !this.lease &&
          !editor.blocked &&
          !editor.interactions.current &&
          (!editor.world.active || editor.tool === "select") &&
          this.markers.reifyAt(event.clientX, event.clientY, this.pressedGhosts)
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
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
        if (this.lease && (event.key === "Escape" || event.key === "Enter")) {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.finish();
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
  private selectionCandidates() {
    const e = this.editor;
    return guideCandidates(
      e.display,
      e.world.active ? [] : e.modeling.targets,
      e.world.active && e.sketch
        ? { sketch: e.sketch.id, curves: [...e.selectionOwners] }
        : undefined,
    );
  }
  private begin(): void {
    const e = this.editor;
    if (e.blocked || e.interactions.current) return;
    this.targets = e.world.active ? [] : [...e.modeling.targets];
    this.curves =
      e.world.active && e.sketch
        ? { sketch: e.sketch.id, curves: [...e.selectionOwners] }
        : undefined;
    this.lease = e.interactions.acquire(
      "guide-points",
      () => this.finish(),
      async () => {
        this.finish();
        return true;
      },
      { navigation: "when-released" },
    );
    this.panel.hidden = !this.lease;
    e.refresh();
  }
  private finish(): void {
    if (this.editor.blocked) return;
    const lease = this.lease;
    this.lease = null;
    this.panel.hidden = true;
    this.hovered = null;
    lease?.release();
    this.editor.refresh();
  }
  private async choose(item: GuideMarker): Promise<void> {
    if (this.editor.blocked) return;
    if (item.guide) {
      this.select(item.guide);
      return;
    }
    if (this.editor.interactions.current && this.editor.interactions.current !== this.lease) return;
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
  hover(anchor: GuideAnchor | null): void {
    this.hovered = anchor;
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
    const e = this.editor;
    if (
      event.button ||
      e.blocked ||
      e.interactions.current ||
      this.lease ||
      !item.guide ||
      e.world.active ||
      e.modeling.tool !== "move"
    )
      return;
    const owner = guideOwner(item.anchor);
    if (
      !e.modeling.targets.some((t) =>
        t.kind === "body" ? t.body === owner : t.kind === "sketch" && t.sketch === owner,
      )
    ) {
      e.modeling.targets =
        item.anchor.kind === "sketch-curve"
          ? [{ kind: "sketch", sketch: owner }]
          : [{ kind: "body", body: owner }];
      e.modeling.setTool("move");
    }
    this.moveGuide(event, item);
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
    let candidates = this.lease ? guideCandidates(e.display, this.targets, this.curves) : [];
    if (!this.lease && !e.interactions.current && (!e.world.active || e.tool === "select")) {
      const hover = e.modeling.hover;
      candidates = guideCandidates(
        e.display,
        !e.world.active && hover ? [hover] : [],
        e.world.active && e.sketch && e.hover
          ? { sketch: e.sketch.id, curves: [...hitIds(e.hover)] }
          : undefined,
      )
        .filter(commonGuide)
        .filter((p) => {
          const screen = e.world.project(p.point);
          return (
            this.pointer && Math.hypot(screen.x - this.pointer.x, screen.y - this.pointer.y) < 36
          );
        });
    }
    candidates = candidates.filter(
      (p) =>
        !keys.has(guideKey(p.anchor)) &&
        e.visibility.visible(guideOwner(p.anchor)) &&
        (p.anchor.kind === "sketch-curve" || e.bodiesVisible),
    );
    const interactive =
      !!this.lease || (!e.interactions.current && (!e.world.active || e.tool === "select"));
    this.markers.update([...saved, ...candidates], !!this.lease, interactive);
    this.ghosts = candidates;
    const selected = e.store.data.guidePoints?.find((p) => p.id === this.selected);
    if (!selected) this.selected = null;
    this.highlight.show(this.hovered ?? selected?.anchor ?? null);
  };
  private selectionKey(): string {
    const e = this.editor;
    return JSON.stringify([e.world.active, e.modeling.targets, [...e.selectionOwners]]);
  }
  dispose(): void {
    this.finish();
    this.abort.abort();
    this.unregister();
    this.editor.world.changed.delete(this.update);
    this.markers.dispose();
    this.highlight.dispose();
    this.panel.remove();
  }
}
