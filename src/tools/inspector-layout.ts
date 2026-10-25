import { uiScale } from "../preferences/ui-scale.js";

export interface InspectorLayout {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  collapsed?: boolean;
  order?: string[];
  closed?: string[];
}
const storageKey = "makeshift.inspector";
export function readInspectorLayout(): InspectorLayout {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
    if (!value || typeof value !== "object") return {};
    const result: InspectorLayout = {};
    for (const key of ["x", "y", "width", "height"] as const)
      if (typeof value[key] === "number" && Number.isFinite(value[key])) result[key] = value[key];
    result.collapsed = value.collapsed === true;
    for (const key of ["order", "closed"] as const)
      if (Array.isArray(value[key]))
        result[key] = value[key].filter((v: unknown) => typeof v === "string");
    return result;
  } catch {
    return {};
  }
}
export function saveInspectorLayout(layout: InspectorLayout): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(layout));
  } catch {
    // Storage can be disabled; the current window still retains its layout.
  }
}

interface PaneRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Pointer coordinates and measured bounds stay in CSS pixels, independent of UI scale. */
export class InspectorPlacement {
  private observer: ResizeObserver;
  private frame = 0;
  private abort = new AbortController();
  constructor(
    private root: HTMLElement,
    private app: HTMLElement,
    private layout: InspectorLayout,
    move: HTMLElement,
  ) {
    this.bind(move, "move");
    move.addEventListener("keydown", this.keydown, { signal: this.abort.signal });
    for (const edge of ["n", "e", "s", "w", "nw", "ne", "se", "sw"]) {
      const handle = document.createElement("div");
      handle.className = "inspector-edge";
      handle.dataset.edge = edge;
      handle.setAttribute("aria-hidden", "true");
      this.root.append(handle);
      this.bind(handle, edge);
    }
    this.observer = new ResizeObserver(this.schedule);
    for (const element of [root, app, app.querySelector("header"), app.querySelector("footer")])
      if (element) this.observer.observe(element);
    this.schedule();
  }
  schedule = (): void => {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.fit();
    });
  };
  private bounds() {
    const area = this.app.getBoundingClientRect();
    return {
      left: 8,
      right: area.width - 8,
      top:
        (this.app.querySelector("header")?.getBoundingClientRect().bottom ?? area.top) -
        area.top +
        8,
      bottom:
        (this.app.querySelector("footer")?.getBoundingClientRect().top ?? area.bottom) -
        area.top -
        8,
    };
  }
  private rect(): PaneRect {
    const rect = this.root.getBoundingClientRect(),
      area = this.app.getBoundingClientRect();
    return {
      x: rect.left - area.left,
      y: rect.top - area.top,
      width: rect.width,
      height: rect.height,
    };
  }
  private fit(): void {
    if (this.root.hidden) return;
    const scale = uiScale(),
      bounds = this.bounds();
    const available = Math.max(40, bounds.bottom - bounds.top);
    const width = Math.min(
      Math.max(260 * scale, this.layout.width ?? 300 * scale),
      bounds.right - bounds.left,
    );
    this.root.classList.toggle("sized", !!this.layout.height);
    this.root.style.width = `${width}px`;
    this.root.style.maxHeight = `${available}px`;
    this.root.style.height = this.layout.collapsed
      ? "auto"
      : this.layout.height
        ? `${Math.min(available, Math.max(120 * scale, this.layout.height))}px`
        : "auto";
    this.root.style.setProperty(
      "--inspector-content-max",
      `${Math.max(40, Math.min(available - 44 * scale, this.app.clientHeight * 0.55))}px`,
    );
    const height = this.root.getBoundingClientRect().height;
    this.root.style.left = `${clamp(this.layout.x ?? bounds.right - width - 12 * scale, bounds.left, bounds.right - width)}px`;
    this.root.style.top = `${clamp(this.layout.y ?? bounds.bottom - height, bounds.top, bounds.bottom - height)}px`;
  }
  private resize(rect: PaneRect, edge: string, dx: number, dy: number): void {
    const bounds = this.bounds();
    const minWidth = Math.min(260 * uiScale(), bounds.right - bounds.left);
    const minHeight = Math.min(120 * uiScale(), bounds.bottom - bounds.top);
    let left = rect.x,
      right = rect.x + rect.width,
      top = rect.y,
      bottom = rect.y + rect.height;
    if (edge.includes("w")) left = clamp(left + dx, bounds.left, right - minWidth);
    if (edge.includes("e")) right = clamp(right + dx, left + minWidth, bounds.right);
    if (edge.includes("n")) top = clamp(top + dy, bounds.top, bottom - minHeight);
    if (edge.includes("s")) bottom = clamp(bottom + dy, top + minHeight, bounds.bottom);
    Object.assign(this.layout, { x: left, y: top, width: right - left, height: bottom - top });
  }
  private bind(handle: HTMLElement, edge: string): void {
    const signal = this.abort.signal;
    let drag:
      | { id: number; x: number; y: number; rect: PaneRect; original: InspectorLayout }
      | undefined;
    handle.addEventListener(
      "pointerdown",
      (event) => {
        if (event.button !== 0 || drag) return;
        event.preventDefault();
        event.stopPropagation();
        drag = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          rect: this.rect(),
          original: { ...this.layout },
        };
        handle.setPointerCapture(event.pointerId);
      },
      { signal },
    );
    handle.addEventListener(
      "pointermove",
      (event) => {
        if (!drag || drag.id !== event.pointerId) return;
        event.stopPropagation();
        const dx = event.clientX - drag.x,
          dy = event.clientY - drag.y;
        if (edge === "move")
          Object.assign(this.layout, { x: drag.rect.x + dx, y: drag.rect.y + dy });
        else this.resize(drag.rect, edge, dx, dy);
        this.fit();
      },
      { signal },
    );
    handle.addEventListener(
      "pointercancel",
      () => {
        if (!drag) return;
        for (const key of ["x", "y", "width", "height"] as const)
          this.layout[key] = drag.original[key];
        drag = undefined;
        this.fit();
      },
      { signal },
    );
    handle.addEventListener(
      "lostpointercapture",
      () => {
        if (!drag) return;
        drag = undefined;
        this.remember();
      },
      { signal },
    );
  }
  private keydown = (event: KeyboardEvent): void => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = this.rect();
    const dx = event.key === "ArrowLeft" ? -16 : event.key === "ArrowRight" ? 16 : 0;
    const dy = event.key === "ArrowUp" ? -16 : event.key === "ArrowDown" ? 16 : 0;
    if (event.shiftKey && !this.layout.collapsed) this.resize(rect, "se", dx, dy);
    else Object.assign(this.layout, { x: rect.x + dx, y: rect.y + dy });
    this.fit();
    this.remember();
  };
  private remember(): void {
    const rect = this.rect();
    this.layout.x = rect.x;
    this.layout.y = rect.y;
    if (this.layout.width) this.layout.width = rect.width;
    if (this.layout.height && !this.layout.collapsed) this.layout.height = rect.height;
    saveInspectorLayout(this.layout);
  }
  dispose(): void {
    this.abort.abort();
    this.observer.disconnect();
    cancelAnimationFrame(this.frame);
  }
}
