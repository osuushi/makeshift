import { longPressDelayMs } from "../model/overlap-input.js";
import { fitOverlapChoices } from "../model/overlap-layout.js";
import { overlapPreviews } from "../model/overlap-preview.js";
import type { SketchEditor } from "../sketch/editor.js";
import { pointerDragThreshold } from "../sketch/pointer-intent.js";
import { GuideHighlight } from "./highlight.js";
import type { GuideMoveTarget } from "./move-target.js";
import "../model/overlap.css";

type Pending = { x: number; y: number; key: string; choices: GuideMoveTarget[] };
/** A drag's existing lease stays authoritative while this transient chooser is open. */
export class GuideMoveChooser {
  readonly element = document.createElement("div");
  private ring = document.createElement("div");
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: Pending | null = null;
  private choices = new Map<HTMLButtonElement, GuideMoveTarget>();
  private highlight: GuideHighlight;
  private hovered: HTMLButtonElement | null = null;
  constructor(
    private editor: SketchEditor,
    private changed: (target: GuideMoveTarget | null) => void,
  ) {
    this.element.className = "selection-overlap guide-move-choices";
    this.element.setAttribute("role", "dialog");
    this.element.setAttribute("aria-label", "Choose snap target");
    this.element.hidden = true;
    this.ring.className = "selection-hold guide-move-hold";
    this.ring.style.setProperty("--hold-duration", `${longPressDelayMs}ms`);
    this.ring.innerHTML = '<span class="selection-hold-progress" aria-hidden="true"></span>';
    this.ring.hidden = true;
    document.body.append(this.element, this.ring);
    this.highlight = new GuideHighlight(editor);
  }
  get opened(): boolean {
    return !this.element.hidden;
  }
  track(event: PointerEvent, choices: GuideMoveTarget[]): void {
    if (this.opened) return;
    if (choices.length < 2 || event.shiftKey) {
      this.clearPending();
      return;
    }
    const key = JSON.stringify(choices.map((p) => p.point));
    if (
      this.pending &&
      this.pending.key === key &&
      Math.hypot(event.clientX - this.pending.x, event.clientY - this.pending.y) <=
        Math.max(6, pointerDragThreshold(event))
    )
      return;
    this.clearPending();
    this.pending = { x: event.clientX, y: event.clientY, key, choices };
    this.ring.style.left = `${event.clientX}px`;
    this.ring.style.top = `${event.clientY}px`;
    this.ring.hidden = false;
    this.timer = setTimeout(() => {
      const pending = this.pending;
      this.clearPending();
      if (pending) this.open(pending);
    }, longPressDelayMs);
  }
  private open(pending: Pending): void {
    const title = document.createElement("div"),
      list = document.createElement("div");
    title.className = "selection-overlap-title";
    title.textContent = "Drag to a target · release to snap";
    list.className = "selection-overlap-items";
    const candidates = pending.choices.map((p, i) => ({
      target: p.reference,
      key: String(i),
      depth: i,
      label: p.label,
    }));
    const previews = overlapPreviews(
      this.editor,
      candidates,
      pending.choices.map((p) => p.point),
    );
    for (const [i, target] of pending.choices.entries()) {
      const button = document.createElement("button"),
        label = document.createElement("span"),
        position = document.createElement("small");
      button.type = "button";
      button.setAttribute("aria-label", target.label);
      button.dataset.point = JSON.stringify(target.point);
      label.textContent = target.label;
      position.textContent = `${target.point.map((v) => Number(v.toFixed(3))).join(", ")} mm`;
      button.append(previews[i], label, position);
      this.choices.set(button, target);
      list.append(button);
    }
    this.element.replaceChildren(title, list);
    this.element.hidden = false;
    for (const button of fitOverlapChoices(this.element)) this.choices.delete(button);
    const bounds = this.element.getBoundingClientRect();
    this.element.style.left = `${Math.max(8, Math.min(pending.x + 16, innerWidth - bounds.width - 8))}px`;
    this.element.style.top = `${Math.max(8, Math.min(pending.y + 16, innerHeight - bounds.height - 8))}px`;
    this.changed(null);
  }
  drag(event: PointerEvent): GuideMoveTarget | null {
    const element = document.elementFromPoint(event.clientX, event.clientY)?.closest("button");
    const button =
      element instanceof HTMLButtonElement && this.choices.has(element) ? element : null;
    const target = button ? (this.choices.get(button) ?? null) : null;
    if (this.hovered !== button) {
      this.hovered?.classList.remove("hovered");
      button?.classList.add("hovered");
      this.hovered = button;
      this.highlight.show(target?.anchor ?? null);
    }
    return target;
  }
  private clearPending(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
    this.ring.hidden = true;
  }
  close(): void {
    this.clearPending();
    this.element.hidden = true;
    this.hovered = null;
    this.choices.clear();
    this.highlight.show(null);
  }
  dispose(): void {
    this.close();
    this.element.remove();
    this.ring.remove();
    this.highlight.dispose();
  }
}
