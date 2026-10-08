import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { PlaneId } from "../sketch/planes.js";
import { toolCatalog } from "../tools/catalog.js";
import type { ConstructionPlane } from "./construction-plane.js";
import { cancelModelSelectionDrag } from "./model-selection-drag.js";
import { type OverlapCandidate, overlapCandidates } from "./overlap-candidates.js";
import { OverlapHighlight } from "./overlap-highlight.js";
import { fitOverlapChoices } from "./overlap-layout.js";
import { overlapPreviews } from "./overlap-preview.js";

export class OverlapChooser {
  readonly element = document.createElement("div");
  private lease: InteractionLease | null = null;
  private highlight: OverlapHighlight;
  private snapshot = "";
  private document: unknown;
  private choices = new Map<HTMLButtonElement, OverlapCandidate>();
  private hovered: HTMLButtonElement | null = null;
  constructor(
    private editor: SketchEditor,
    private selectPlane: (p: ConstructionPlane | PlaneId) => void,
  ) {
    this.element.className = "selection-overlap";
    this.element.setAttribute("role", "dialog");
    this.element.setAttribute("aria-label", "Choose overlapping geometry");
    this.element.tabIndex = -1;
    this.element.hidden = true;
    document.body.append(this.element);
    this.highlight = new OverlapHighlight(editor);
    editor.world.changed.add(this.update);
  }
  get opened(): boolean {
    return !!this.lease;
  }
  async open(event: PointerEvent): Promise<void> {
    const e = this.editor;
    if (e.interactions.current?.kind === "model-selection") await e.interactions.cancel();
    const membership = e.interactions.current?.kind === "tag-membership";
    if (membership) cancelModelSelectionDrag(e);
    if (!membership && e.interactions.current) {
      await toolCatalog(e).activate({ reason: () => null, run: () => this.open(event) });
      return;
    }
    if (e.blocked || e.world.active || (e.interactions.current && !membership)) return;
    const candidates = overlapCandidates(e, { x: event.clientX, y: event.clientY });
    if (!candidates.length) return;
    this.lease = membership
      ? e.interactions.current
      : e.interactions.acquire("selection-choice", () => this.close());
    if (!this.lease) return;
    this.document = e.store.data;
    this.snapshot = this.viewKey();
    e.modeling.hover = null;
    this.populate(candidates, event);
    this.element.hidden = false;
    for (const button of fitOverlapChoices(this.element)) this.choices.delete(button);
    const bounds = this.element.getBoundingClientRect();
    this.element.style.left = `${Math.max(8, Math.min(event.clientX + 16, innerWidth - bounds.width - 8))}px`;
    this.element.style.top = `${Math.max(8, Math.min(event.clientY + 16, innerHeight - bounds.height - 8))}px`;
    this.element.focus({ preventScroll: true });
    e.refresh();
  }
  private populate(candidates: OverlapCandidate[], event: PointerEvent): void {
    const title = document.createElement("div");
    title.className = "selection-overlap-title";
    title.textContent = "Drag to choose · release to select";
    const close = document.createElement("button");
    close.textContent = "×";
    close.setAttribute("aria-label", "Close geometry chooser");
    close.onclick = () => this.close();
    title.append(close);
    const list = document.createElement("div");
    list.className = "selection-overlap-items";
    const previews = overlapPreviews(this.editor, candidates);
    this.choices.clear();
    for (const [index, candidate] of candidates.entries()) {
      const button = document.createElement("button");
      button.dataset.kind = candidate.target.kind;
      button.dataset.key = candidate.key;
      button.dataset.depth = String(candidate.depth);
      button.setAttribute("aria-label", candidate.label);
      const label = document.createElement("span");
      label.textContent = candidate.label;
      button.append(previews[index], label);
      this.choices.set(button, candidate);
      button.onfocus = () => this.highlightChoice(button);
      button.onblur = () => this.highlightChoice(null);
      button.onclick = (click) => {
        if (this.opened && click.detail === 0) this.choose(candidate, event);
      };
      list.append(button);
    }
    this.element.replaceChildren(title, list);
  }
  private choiceAt(event: PointerEvent): HTMLButtonElement | null {
    const button = document.elementFromPoint(event.clientX, event.clientY)?.closest("button");
    return button instanceof HTMLButtonElement && this.choices.has(button) ? button : null;
  }
  drag(event: PointerEvent): void {
    this.highlightChoice(this.choiceAt(event));
  }
  release(event: PointerEvent): void {
    const button = this.choiceAt(event);
    const candidate = button && this.choices.get(button);
    if (candidate) this.choose(candidate, event);
    else this.close();
  }
  private highlightChoice(button: HTMLButtonElement | null): void {
    if (this.hovered === button) return;
    this.hovered?.classList.remove("hovered");
    this.hovered = button;
    button?.classList.add("hovered");
    const candidate = button && this.choices.get(button);
    if (candidate) this.element.dataset.highlight = candidate.key;
    else delete this.element.dataset.highlight;
    this.highlight.show(candidate?.target ?? null);
  }
  private choose(candidate: OverlapCandidate, event: PointerEvent): void {
    this.close();
    const target = candidate.target,
      e = this.editor;
    if (target.kind === "plane") {
      if (target.world) this.selectPlane(target.world);
      else {
        const plane = e.store.data.constructionPlanes?.find((p) => p.id === target.saved);
        if (plane) this.selectPlane(plane);
      }
    } else {
      if (target.kind === "profiles")
        e.modeling.chooseProfiles(
          target.sketch,
          target.profiles,
          event.shiftKey,
          event.metaKey || event.ctrlKey,
        );
      else e.modeling.choose(target, event.shiftKey, event.metaKey || event.ctrlKey);
      e.modeling.alternatives = [];
      e.refresh();
    }
  }
  private viewKey(): string {
    const e = this.editor,
      c = e.world.camera;
    return `${c.position.toArray()}:${c.quaternion.toArray()}:${e.world.height}:${e.visibility.key}:${e.bodiesVisible}:${e.world.active}`;
  }
  private update = (): void => {
    if (
      this.opened &&
      (this.editor.interactions.current !== this.lease ||
        this.document !== this.editor.store.data ||
        this.snapshot !== this.viewKey())
    )
      this.close();
  };
  close(): void {
    if (!this.lease) return;
    this.element.hidden = true;
    this.hovered = null;
    this.choices.clear();
    delete this.element.dataset.highlight;
    this.highlight.show(null);
    const lease = this.lease;
    this.lease = null;
    if (lease.kind !== "tag-membership") lease.release();
    this.editor.world.canvas.focus({ preventScroll: true });
  }
  dispose(): void {
    this.close();
    this.editor.world.changed.delete(this.update);
    this.highlight.dispose();
    this.element.remove();
  }
}
