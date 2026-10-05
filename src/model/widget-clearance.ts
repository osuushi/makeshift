import { WidgetFreeze } from "./widget-freeze.js";
import {
  fitFrozenWidgets,
  freeCardSpace,
  measuredControlRect,
  widgetPathsSafe,
  widgetPointerOffset,
  widgetViewport,
} from "./widget-viewport.js";
export interface WidgetTarget {
  x: number;
  y: number;
  size: number;
}

function overlaps(a: WidgetTarget, b: WidgetTarget, gap: number): boolean {
  const clearance = (a.size + b.size) / 2 + gap;
  return Math.abs(a.x - b.x) < clearance && Math.abs(a.y - b.y) < clearance;
}

/** Stable priority, actual hit rectangles, and outward movement along the projected ray. */
export function separateWidgets(
  targets: readonly WidgetTarget[],
  obstacles: readonly WidgetTarget[],
): WidgetTarget[] {
  const placed = [...obstacles];
  return targets.map((target, index) => {
    const length = Math.hypot(target.x, target.y);
    const angle = (index * Math.PI * 2) / targets.length;
    const dx = length > 1 ? target.x / length : Math.cos(angle);
    const dy = length > 1 ? target.y / length : Math.sin(angle);
    let distance = 0;
    // Each obstacle excludes one interval on this ray. Jump beyond that interval
    // rather than iterating pixels or imposing a cap that can leave an overlap.
    for (let pass = 0; pass <= placed.length; pass++) {
      const candidate = { ...target, x: target.x + dx * distance, y: target.y + dy * distance };
      const collision = placed.find((other) => overlaps(candidate, other, 6));
      if (!collision) {
        placed.push(candidate);
        return candidate;
      }
      const radius = (target.size + collision.size) / 2 + 7;
      const exitX =
        Math.abs(dx) < 1e-8 ? Infinity : (collision.x + Math.sign(dx) * radius - target.x) / dx;
      const exitY =
        Math.abs(dy) < 1e-8 ? Infinity : (collision.y + Math.sign(dy) * radius - target.y) / dy;
      distance = Math.max(distance, Math.min(exitX, exitY));
    }
    throw new Error("Widget clearance did not converge");
  });
}

/** Animate only collision corrections: normal camera/model tracking remains immediate. */
export class WidgetClearance {
  private constraints = new Map<
    HTMLElement,
    { width: string; height: string; maxWidth: string; maxHeight: string; overflow: string }
  >();
  private targets = new Map<HTMLElement, { x: number; y: number; width: number; height: number }>();
  private freeze: WidgetFreeze;
  private guide = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  private immediate = false;

  constructor(private root: HTMLElement) {
    this.guide.setAttribute("aria-hidden", "true");
    this.guide.classList.add("widget-docking-guide");
    this.guide.style.cssText =
      "position:absolute;left:0;top:0;width:1px;height:1px;overflow:visible;pointer-events:none";
    root.append(this.guide);
    this.freeze = new WidgetFreeze(root, this.targets);
  }

  update(
    entries: { element: HTMLElement; nominal: WidgetTarget }[],
    obstacles: WidgetTarget[],
    extra: HTMLElement[] = [],
  ): void {
    const positions = separateWidgets(
      entries.map((entry) => entry.nominal),
      obstacles,
    );
    const baseline = new Map<HTMLElement, { x: number; y: number }>();
    entries.forEach(({ element, nominal }, index) => {
      element.style.left = `${nominal.x}px`;
      element.style.top = `${nominal.y}px`;
      baseline.set(element, {
        x: positions[index].x - nominal.x,
        y: positions[index].y - nominal.y,
      });
    });
    this.fit([...entries.map((entry) => entry.element), ...extra], baseline);
  }

  fit(elements: HTMLElement[], baseline = new Map<HTMLElement, { x: number; y: number }>()): void {
    if (this.root.hidden) return;
    const visible = elements.filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    // Parameter/action cards have priority in a small viewport; glyphs retain
    // their typed fallback when the available space cannot hold both.
    visible.sort((a, b) => Number(a.matches("button")) - Number(b.matches("button")));
    const { viewport, obstacles } = widgetViewport(this.root);
    for (const element of visible) this.constrain(element, viewport);
    const frozen = this.freeze.active;
    const held = this.freeze.heldControls(visible, obstacles, viewport);
    const measure = () => {
      const nominal = visible.map((element) => {
        const rect = measuredControlRect(element),
          previous = widgetPointerOffset(element);
        return { ...rect, x: rect.x - previous.x, y: rect.y - previous.y };
      });
      const desired = nominal.map((rect, i) => {
        const correction = baseline.get(visible[i]);
        return frozen && this.targets.has(visible[i])
          ? measuredControlRect(visible[i])
          : { ...rect, x: rect.x + (correction?.x ?? 0), y: rect.y + (correction?.y ?? 0) };
      });
      return { nominal, desired };
    };
    let { nominal, desired } = measure();
    const place = () =>
      fitFrozenWidgets(desired, visible.map(measuredControlRect), held, obstacles, viewport);
    let positions = place();
    visible.forEach((element, i) => {
      if (!positions[i].limited || element.matches("button, input")) return;
      const space = freeCardSpace(
        desired[i],
        [...obstacles, ...positions.filter((_, j) => j !== i && held[j]), ...positions.slice(0, i)],
        viewport,
      );
      if (!space) return;
      this.constrain(element, space);
      ({ nominal, desired } = measure());
      positions = place();
    });
    this.immediate = !widgetPathsSafe(
      visible.map(measuredControlRect),
      positions,
      obstacles,
      viewport,
    );
    visible.forEach((element, i) => {
      const correction = { x: positions[i].x - nominal[i].x, y: positions[i].y - nominal[i].y };
      if (!this.targets.has(element) || (frozen && !held[i])) {
        element.style.transition = "none";
        element.style.translate = `${correction.x}px ${correction.y}px`;
      }
      element.dataset.widgetFit = positions[i].limited ? "limited" : "clear";
      this.targets.set(element, {
        ...correction,
        width: positions[i].width,
        height: positions[i].height,
      });
    });
    for (const element of this.targets.keys())
      if (!visible.includes(element)) this.targets.delete(element);
    this.paint(visible, nominal, positions);
    this.freeze.resume(this.immediate);
  }

  private constrain(element: HTMLElement, viewport: { width: number; height: number }): void {
    const original = this.constraints.get(element);
    if (original) Object.assign(element.style, original);
    if (element.matches("button, input")) return;
    const rect = measuredControlRect(element);
    if (rect.width <= viewport.width && rect.height <= viewport.height) return;
    if (!original)
      this.constraints.set(element, {
        width: element.style.width,
        height: element.style.height,
        maxWidth: element.style.maxWidth,
        maxHeight: element.style.maxHeight,
        overflow: element.style.overflow,
      });
    // Expand the scroll content to include any absolute chooser before constraining
    // its viewport. Normal cards retain visible overflow and never clip a chooser.
    if (element.querySelector(".extrude-targets")) {
      element.style.width = `${rect.width}px`;
      element.style.height = `${rect.height}px`;
    }
    element.style.maxWidth = `${Math.max(0, viewport.width - 0.02)}px`;
    element.style.maxHeight = `${Math.max(0, viewport.height - 0.02)}px`;
    element.style.overflow = "auto";
  }

  private paint(
    elements: HTMLElement[],
    nominal: { x: number; y: number }[],
    positions: { x: number; y: number }[],
  ): void {
    this.guide.replaceChildren();
    const root = this.root.getBoundingClientRect();
    elements.forEach((element, i) => {
      const a = nominal[i],
        b = positions[i];
      if (!element.matches("button, .move-anchor") || Math.hypot(a.x - b.x, a.y - b.y) < 12) return;
      const line = document.createElementNS(this.guide.namespaceURI, "path");
      line.setAttribute("d", `M${a.x - root.x} ${a.y - root.y}L${b.x - root.x} ${b.y - root.y}`);
      line.setAttribute("fill", "none");
      line.setAttribute("stroke", "#7c96af");
      line.setAttribute("stroke-width", "1");
      line.setAttribute("stroke-dasharray", "3 4");
      this.guide.append(line);
    });
  }

  dispose(): void {
    this.freeze.dispose();
    this.targets.clear();
    this.constraints.clear();
    this.guide.remove();
  }
}
