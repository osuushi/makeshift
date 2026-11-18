import type { SketchEditor } from "../sketch/editor.js";
import type { GuideCandidate } from "./candidates.js";
import { near } from "./geometry.js";
import { advanceMarkerFade, desireMarker, type MarkerFade } from "./marker-fade.js";
import { guideMarkerOccluded } from "./marker-visibility.js";
import { GuideMeaningChoices } from "./meaning-choices.js";
import { type GuidePoint, guideKey, guideLabel } from "./types.js";
import { GuideWidgetClearance } from "./widget-clearance.js";

export type GuideMarker = GuideCandidate & { guide?: GuidePoint };
interface MarkerEntry extends MarkerFade {
  element: HTMLButtonElement;
  items: GuideMarker[];
  key: string;
}
/** Nearby points share one hit target; labels preserve their distinct definitions. */
export class GuideMarkers {
  readonly root = document.createElement("div");
  private meanings: GuideMeaningChoices;
  private frame = 0;
  private clearance: GuideWidgetClearance;
  private buttons: MarkerEntry[] = [];
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
    const incoming = groups.map((group) => {
      const key = JSON.stringify(
        group.map((p) => [p.guide?.id, p.guide?.name, p.label, guideKey(p.anchor)]).sort(),
      );
      return { group, key, existing: this.buttons.find((entry) => entry.key === key) };
    });
    // Reserve unchanged groups before matching a changed set of meanings to its location.
    const desired = new Set(incoming.flatMap(({ existing }) => (existing ? [existing] : [])));
    for (const { group, key, existing } of incoming) {
      let button =
        existing ??
        this.buttons.find(
          (entry) =>
            !desired.has(entry) &&
            entry.items.some((previous) => group.some((next) => near(previous.point, next.point))),
        );
      if (!button) {
        button = this.button(group, key);
        this.buttons.push(button);
      }
      desired.add(button);
      button.items = group;
      if (button.key !== key) {
        button.key = key;
        describeMarker(button.element, group, true);
        if (button.element.matches(":hover")) this.hover(group);
      }
      const p = this.editor.world.project(group[0].point);
      button.element.style.left = `${p.x}px`;
      button.element.style.top = `${p.y}px`;
      button.element.style.pointerEvents = interactive ? "auto" : "none";
      button.element.dataset.interactive = String(button.element.style.pointerEvents === "auto");
      button.element.disabled = this.editor.blocked;
      const selected = group.some((p) => p.guide && this.selected().has(p.guide.id));
      button.element.classList.toggle("selected", selected);
      button.element.setAttribute("aria-pressed", String(selected));
      const chosen = group.find((p) => p.guide && this.selected().has(p.guide.id));
      const available = chosen ? canStart(chosen) : group.some(canStart);
      button.element.classList.toggle("start-unavailable", !available);
      if (available) button.element.removeAttribute("aria-description");
      else button.element.setAttribute("aria-description", "Cannot start the current tool here");
    }
    // Departing ghosts are visual only; they cannot accept stale geometry actions.
    for (const button of this.buttons) {
      desireMarker(
        button,
        desired.has(button),
        performance.now(),
        button.items.some((item) => item.guide),
      );
      if (!button.desired) button.element.style.pointerEvents = "none";
    }
    if (!this.frame) this.frame = requestAnimationFrame(this.animate);
    this.hideOverlaps();
    this.clearance.schedule();
  }
  private hideOverlaps(): void {
    if (!this.buttons.length) return;
    const bounds = this.clearance.bounds();
    for (const button of this.buttons) {
      const point = this.editor.world.project(button.items[0].point);
      button.element.style.left = `${point.x}px`;
      button.element.style.top = `${point.y}px`;
      button.element.hidden = guideMarkerOccluded(this.editor, button.items[0].point, bounds);
    }
  }
  private animate = (now: number): void => {
    this.frame = 0;
    let pending = false;
    this.buttons = this.buttons.filter((entry) => {
      const saved = entry.items.some((item) => item.guide);
      const fading = advanceMarkerFade(entry, now, saved);
      entry.element.style.opacity = String(entry.opacity * (saved ? 1 : 0.8));
      if (!entry.desired && entry.opacity === 0) {
        entry.element.remove();
        return false;
      }
      pending ||= fading;
      return true;
    });
    if (pending) this.frame = requestAnimationFrame(this.animate);
  };
  private button(items: GuideMarker[], key: string): MarkerEntry {
    const button = document.createElement("button");
    const now = performance.now();
    const saved = items.some((item) => item.guide);
    const entry = {
      element: button,
      items,
      key,
      desired: true,
      born: now,
      updated: now,
      opacity: saved ? 1 : 0,
    };
    button.style.opacity = String(entry.opacity);
    button.className = "guide-marker";
    button.innerHTML =
      '<svg class="guide-cross" viewBox="0 0 12 12" aria-hidden="true"><path d="M 1 6 H 11 M 6 1 V 11"/></svg>';
    describeMarker(button, items, false);
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
  clearCandidates(): void {
    this.buttons = this.buttons.filter((entry) => {
      if (entry.items.every((item) => item.guide)) return true;
      entry.element.remove();
      return false;
    });
  }
  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.root.remove();
    this.meanings.dispose();
    this.clearance.dispose();
  }
}

function describeMarker(button: HTMLButtonElement, items: GuideMarker[], animateCount: boolean) {
  const saved = items.some((item) => item.guide);
  button.classList.toggle("saved", saved);
  button.classList.toggle("ghost", !saved);
  button.title = items.map((p) => (p.guide ? guideLabel(p.guide) : p.label)).join("\n");
  if (!saved) button.title += " · Click to keep";
  button.setAttribute(
    "aria-label",
    items.length > 1
      ? "Choose guide point"
      : `${items[0].guide ? "Select" : "Create"} ${items[0].guide?.name ?? items[0].label}`,
  );
  updateCount(button, items.length, animateCount);
}

function updateCount(button: HTMLButtonElement, count: number, animate: boolean): void {
  const text = count > 1 ? String(count) : null;
  const active = button.querySelector<HTMLSpanElement>(".guide-count");
  if ((active?.textContent ?? null) === text) return;
  if (active) fadeCount(active, false);
  if (text === null) return;
  const next =
    [...button.querySelectorAll<HTMLSpanElement>(".guide-count-fading")].find(
      (badge) => badge.textContent === text,
    ) ?? document.createElement("span");
  next.textContent = text;
  next.setAttribute("aria-hidden", "true");
  if (!next.parentElement) {
    next.className = "guide-count";
    if (animate) next.style.opacity = "0";
    button.append(next);
  }
  if (animate) fadeCount(next, true);
}

function fadeCount(badge: HTMLSpanElement, visible: boolean): void {
  const previous = getComputedStyle(badge).opacity;
  for (const animation of badge.getAnimations()) animation.cancel();
  badge.className = visible ? "guide-count" : "guide-count-fading";
  badge.style.opacity = visible ? "1" : "0";
  const animation = badge.animate([{ opacity: previous }, { opacity: badge.style.opacity }], 100);
  if (!visible)
    animation.onfinish = () => {
      if (badge.classList.contains("guide-count-fading")) badge.remove();
    };
}
