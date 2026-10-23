import type { SketchEditor } from "../sketch/editor.js";
import type { GuideCandidate } from "./candidates.js";
import { GuideMeaningChoices } from "./meaning-choices.js";
import { type GuidePoint, guideKey, guideLabel } from "./types.js";
import { GuideWidgetClearance, guideOverlapsWidget } from "./widget-clearance.js";

export type GuideMarker = GuideCandidate & { guide?: GuidePoint };
/** Nearby points share one hit target; labels preserve their distinct definitions. */
export class GuideMarkers {
  readonly root = document.createElement("div");
  private meanings: GuideMeaningChoices;
  private key = "";
  private clearance: GuideWidgetClearance;
  private buttons: { element: HTMLButtonElement; items: GuideMarker[] }[] = [];
  constructor(
    private editor: SketchEditor,
    host: HTMLElement,
    private choose: (item: GuideMarker, additive: boolean) => void,
    private hover: (items: readonly GuideMarker[] | null) => void,
    private drag: (event: PointerEvent, item: GuideMarker) => void,
    private selected: () => ReadonlySet<string>,
  ) {
    this.root.className = "guide-markers";
    host.append(this.root);
    this.meanings = new GuideMeaningChoices(editor, host, choose, hover);
    this.clearance = new GuideWidgetClearance(host, () => this.hideOverlaps());
  }
  update(
    items: GuideMarker[],
    interactive: boolean,
    canStart: (item: GuideMarker) => boolean,
  ): void {
    const groups: GuideMarker[][] = [];
    for (const item of items) {
      const p = this.editor.world.project(item.point);
      const group = groups.find((g) => {
        const q = this.editor.world.project(g[0].point);
        return Math.hypot(p.x - q.x, p.y - q.y) < 14;
      });
      if (group) group.push(item);
      else groups.push([item]);
    }
    const key = JSON.stringify([
      interactive,
      groups.map((g) => g.map((p) => [p.guide?.id, p.guide?.name, p.label, guideKey(p.anchor)])),
    ]);
    if (key !== this.key) {
      this.key = key;
      this.root.replaceChildren();
      this.buttons = groups.map((group) => this.button(group));
    }
    for (const [i, button] of this.buttons.entries()) {
      button.items = groups[i];
      const p = this.editor.world.project(groups[i][0].point);
      button.element.style.left = `${p.x}px`;
      button.element.style.top = `${p.y}px`;
      button.element.style.pointerEvents = interactive ? "auto" : "none";
      button.element.dataset.interactive = String(button.element.style.pointerEvents === "auto");
      button.element.disabled = this.editor.blocked;
      const selected = groups[i].some((p) => p.guide && this.selected().has(p.guide.id));
      button.element.classList.toggle("selected", selected);
      button.element.setAttribute("aria-pressed", String(selected));
      const chosen = groups[i].find((p) => p.guide && this.selected().has(p.guide.id));
      const available = chosen ? canStart(chosen) : groups[i].some(canStart);
      button.element.classList.toggle("start-unavailable", !available);
      if (available) button.element.removeAttribute("aria-description");
      else button.element.setAttribute("aria-description", "Cannot start the current tool here");
    }
    this.hideOverlaps();
    this.clearance.schedule();
  }
  private hideOverlaps(): void {
    const bounds = this.clearance.bounds();
    for (const button of this.buttons) {
      const point = this.editor.world.project(button.items[0].point);
      button.element.hidden = guideOverlapsWidget(point, bounds);
    }
  }
  private button(items: GuideMarker[]) {
    const button = document.createElement("button");
    const entry = { element: button, items };
    button.className = `guide-marker${items.some((p) => p.guide) ? " saved" : " ghost"}`;
    button.innerHTML =
      '<svg class="guide-cross" viewBox="0 0 12 12" aria-hidden="true"><path d="M 1 6 H 11 M 6 1 V 11"/></svg>';
    if (items.length > 1) {
      const count = document.createElement("span");
      count.className = "guide-count";
      count.textContent = String(items.length);
      button.append(count);
    }
    button.title = items.map((p) => (p.guide ? guideLabel(p.guide) : p.label)).join("\n");
    if (!items.some((p) => p.guide)) button.title += " · Click to keep";
    button.setAttribute(
      "aria-label",
      items.length > 1
        ? "Choose guide point"
        : `${items[0].guide ? "Select" : "Create"} ${items[0].guide?.name ?? items[0].label}`,
    );
    const open = (additive: boolean) => {
      if (entry.items.length === 1) this.choose(entry.items[0], additive);
      else this.meanings.open(entry.items, additive);
    };
    button.onclick = (event) => {
      event.stopPropagation();
      if (event.detail <= 1) open(event.shiftKey);
    };
    button.ondblclick = (event) => {
      event.stopPropagation();
    };
    button.onpointerdown = (event) => {
      event.stopPropagation();
      const chosen =
        entry.items.find((p) => p.guide && this.selected().has(p.guide.id)) ??
        (entry.items.length === 1 ? entry.items[0] : undefined);
      if (chosen?.guide && !event.shiftKey) this.drag(event, chosen);
    };
    button.onpointerenter = () => this.hover(entry.items);
    button.onpointerleave = () => this.hover(null);
    this.root.append(button);
    return entry;
  }
  closeChoices(): void {
    this.meanings.close();
  }
  dispose(): void {
    this.root.remove();
    this.meanings.dispose();
    this.clearance.dispose();
  }
}
