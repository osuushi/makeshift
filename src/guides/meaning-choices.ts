import type { SketchEditor } from "../sketch/editor.js";
import { GuideChoiceDismiss } from "./choice-dismiss.js";
import type { GuideMarker } from "./markers.js";

/** A pending meaning has a default, but no accepted document edit until confirmed. */
export class GuideMeaningChoices {
  readonly element = document.createElement("div");
  private pending: { item: GuideMarker; additive: boolean; deleting: boolean } | null = null;
  private abort = new AbortController();
  private dismiss: GuideChoiceDismiss;
  constructor(
    private editor: SketchEditor,
    host: HTMLElement,
    private choose: (item: GuideMarker, additive: boolean) => void,
    private remove: (item: GuideMarker) => void,
    private hover: (items: readonly GuideMarker[] | null) => void,
  ) {
    this.element.className = "guide-choices";
    this.element.setAttribute("role", "dialog");
    this.element.setAttribute("aria-label", "Choose guide meaning");
    this.element.hidden = true;
    host.append(this.element);
    this.dismiss = new GuideChoiceDismiss(this.element, () => this.finish(!this.pending?.deleting));
    window.addEventListener(
      "pointerdown",
      (event) => {
        if (!this.pending || this.element.contains(event.target as Node)) return;
        this.finish(!this.pending.deleting);
      },
      { capture: true, signal: this.abort.signal },
    );
    window.addEventListener(
      "keydown",
      (event) => {
        if (!this.pending || event.key !== "Escape") return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.finish(false);
      },
      { capture: true, signal: this.abort.signal },
    );
  }
  open(items: GuideMarker[], additive: boolean, deleting = false): void {
    this.close();
    this.pending = { item: items[0], additive, deleting };
    const title = document.createElement("strong");
    title.textContent = deleting ? "Delete a guide point" : "Choose a guide point";
    this.element.replaceChildren(title);
    for (const item of items) {
      const button = document.createElement("button");
      button.textContent = item.guide ? `${item.guide.name} · ${item.label}` : item.label;
      button.setAttribute("aria-pressed", String(!deleting && item === items[0]));
      button.onclick = () => {
        this.pending = { item, additive, deleting };
        this.finish(true);
      };
      button.onpointerenter = () => this.hover([item]);
      button.onpointerleave = () => this.hover([items[0]]);
      this.element.append(button);
    }
    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    cancel.onclick = () => this.finish(false);
    this.element.append(cancel);
    const p = this.editor.world.project(items[0].point);
    this.element.style.left = `${Math.max(8, Math.min(p.x + 15, innerWidth - 290))}px`;
    this.element.style.top = `${Math.max(60, Math.min(p.y + 15, innerHeight - 50 - items.length * 34))}px`;
    this.element.hidden = false;
    this.dismiss.open(p);
    this.hover([items[0]]);
    this.element.querySelector("button")?.focus();
  }
  private finish(accept: boolean): void {
    const pending = this.pending;
    this.close();
    this.hover(null);
    if (!accept || !pending) return;
    if (pending.deleting) this.remove(pending.item);
    else this.choose(pending.item, pending.additive);
  }
  close(): void {
    this.pending = null;
    this.element.hidden = true;
    this.dismiss.close();
  }
  dispose(): void {
    this.close();
    this.abort.abort();
    this.dismiss.dispose();
    this.element.remove();
  }
}
