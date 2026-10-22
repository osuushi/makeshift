import type { SketchEditor } from "../sketch/editor.js";
import type { Vector } from "../sketch/planes.js";
import type { GuideCandidate } from "./candidates.js";
import { type GuidePoint, guideKey, guideLabel } from "./types.js";

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
    private hover: (items: readonly GuideMarker[] | null) => void,
    private drag: (event: PointerEvent, item: GuideMarker) => void,
    private selected: () => string | null,
    private remove: (item: GuideMarker) => void,
  ) {
    this.root.className = "guide-markers";
    this.choices.className = "guide-choices";
    this.choices.hidden = true;
    host.append(this.root, this.choices);
  }
  update(items: GuideMarker[], interactive: boolean): void {
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
      this.choices.hidden = true;
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
      const selected = groups[i].some((p) => p.guide?.id === this.selected());
      button.element.classList.toggle("selected", selected);
      button.element.setAttribute("aria-pressed", String(selected));
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
    if (items.some((p) => p.guide)) button.title += " · Double-click to delete";
    if (!items.some((p) => p.guide)) button.title += " · Double-click to keep";
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
      if (entry.items.some((p) => p.guide) || event.detail === 0) open();
    };
    button.ondblclick = (event) => {
      event.stopPropagation();
      const saved = entry.items.filter((p) => p.guide);
      if (saved.length === 1) this.remove(saved[0]);
      else if (saved.length) this.openChoices(saved, true);
      else open();
    };
    button.onpointerdown = (event) => {
      event.stopPropagation();
      const chosen =
        entry.items.find((p) => p.guide?.id === this.selected()) ??
        (entry.items.length === 1 ? entry.items[0] : undefined);
      if (chosen?.guide) this.drag(event, chosen);
    };
    button.onpointerenter = () => this.hover(entry.items);
    button.onpointerleave = () => this.hover(null);
    this.root.append(button);
    return entry;
  }
  private openChoices(items: GuideMarker[], deleting = false): void {
    this.choices.replaceChildren();
    const title = document.createElement("strong");
    title.textContent = deleting ? "Delete a guide point" : "Choose a guide point";
    this.choices.append(title);
    for (const item of items) {
      const button = document.createElement("button");
      button.textContent = item.guide ? `${item.guide.name} · ${item.label}` : item.label;
      button.onclick = () => {
        this.choices.hidden = true;
        if (deleting) this.remove(item);
        else this.choose(item);
      };
      button.onpointerenter = () => this.hover([item]);
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
