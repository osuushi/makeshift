import type { SketchEditor } from "../sketch/editor.js";
import type { Vector } from "../sketch/planes.js";
import type { GuideCandidate } from "./candidates.js";
import { type GuidePoint, guideKey } from "./types.js";

export type GuideMarker = GuideCandidate & { guide?: GuidePoint };
/** Nearby points share one hit target; labels preserve their distinct definitions. */
export class GuideMarkers {
  readonly root = document.createElement("div");
  readonly choices = document.createElement("div");
  private key = "";
  private buttons: { element: HTMLButtonElement; items: GuideMarker[] }[] = [];
  constructor(
    private editor: SketchEditor,
    host: HTMLElement,
    private choose: (item: GuideMarker) => void,
    private hover: (item: GuideMarker | null) => void,
    private drag: (event: PointerEvent, item: GuideMarker) => void,
    private selected: () => string | null,
  ) {
    this.root.className = "guide-markers";
    this.choices.className = "guide-choices";
    this.choices.hidden = true;
    host.append(this.root, this.choices);
  }
  update(items: GuideMarker[], explicit: boolean, interactive: boolean): void {
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
      explicit,
      interactive,
      groups.map((g) => g.map((p) => [p.guide?.id, p.label, guideKey(p.anchor)])),
    ]);
    if (key !== this.key) {
      this.key = key;
      this.root.replaceChildren();
      this.choices.hidden = true;
      this.buttons = groups.map((group) => this.button(group, explicit));
    }
    for (const [i, button] of this.buttons.entries()) {
      button.items = groups[i];
      const p = this.editor.world.project(groups[i][0].point);
      button.element.style.left = `${p.x}px`;
      button.element.style.top = `${p.y}px`;
      button.element.style.pointerEvents = interactive ? "auto" : "none";
      button.element.dataset.interactive = String(button.element.style.pointerEvents === "auto");
      button.element.disabled = this.editor.blocked;
    }
  }
  private button(items: GuideMarker[], explicit: boolean) {
    const button = document.createElement("button");
    const entry = { element: button, items };
    button.className = `guide-marker${items.some((p) => p.guide) ? " saved" : " ghost"}`;
    button.textContent = items.length > 1 ? String(items.length) : "+";
    button.title = items
      .map((p) => (p.guide ? `${p.guide.name} · ${p.label}` : p.label))
      .join("\n");
    if (!explicit && !items.some((p) => p.guide)) button.title += " · Double-click to keep";
    button.setAttribute(
      "aria-label",
      items.length > 1
        ? "Choose guide point"
        : `${items[0].guide ? "Select" : "Create"} ${items[0].guide?.name ?? items[0].label}`,
    );
    const open = () => {
      if (entry.items.length === 1) this.choose(entry.items[0]);
      else this.openChoices(entry.items);
    };
    button.onclick = (event) => {
      event.stopPropagation();
      if (explicit || entry.items.some((p) => p.guide) || event.detail === 0) open();
    };
    button.ondblclick = (event) => {
      event.stopPropagation();
      if (!explicit) open();
    };
    button.onpointerdown = (event) => {
      event.stopPropagation();
      const chosen =
        entry.items.find((p) => p.guide?.id === this.selected()) ??
        (entry.items.length === 1 ? entry.items[0] : undefined);
      if (chosen?.guide) this.drag(event, chosen);
    };
    button.onpointerenter = () => this.hover(entry.items.length === 1 ? entry.items[0] : null);
    button.onpointerleave = () => this.hover(null);
    this.root.append(button);
    return entry;
  }
  private openChoices(items: GuideMarker[]): void {
    this.choices.replaceChildren();
    const title = document.createElement("strong");
    title.textContent = "Choose a guide point";
    this.choices.append(title);
    for (const item of items) {
      const button = document.createElement("button");
      button.textContent = item.guide ? `${item.guide.name} · ${item.label}` : item.label;
      button.onclick = () => {
        this.choices.hidden = true;
        this.choose(item);
      };
      button.onpointerenter = () => this.hover(item);
      button.onpointerleave = () => this.hover(null);
      this.choices.append(button);
    }
    const close = document.createElement("button");
    close.textContent = "Cancel";
    close.onclick = () => {
      this.choices.hidden = true;
      this.hover(null);
    };
    this.choices.append(close);
    const p = this.editor.world.project(items[0].point as Vector);
    this.choices.style.left = `${Math.max(8, Math.min(p.x + 15, window.innerWidth - 290))}px`;
    this.choices.style.top = `${Math.max(60, Math.min(p.y + 15, window.innerHeight - 50 - items.length * 34))}px`;
    this.choices.hidden = false;
    this.choices.querySelector("button")?.focus();
  }
  dispose(): void {
    this.root.remove();
    this.choices.remove();
  }
}
