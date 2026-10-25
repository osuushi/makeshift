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
    resize: HTMLElement,
  ) {
    this.bind(move, false);
    this.bind(resize, true);
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
  private fit(): void {
    if (this.root.hidden) return;
    const scale = uiScale();
    const area = this.app.getBoundingClientRect();
    const top =
      (this.app.querySelector("header")?.getBoundingClientRect().bottom ?? area.top) - area.top + 8;
    const bottom =
      (this.app.querySelector("footer")?.getBoundingClientRect().top ?? area.bottom) - area.top - 8;
    const available = Math.max(32, bottom - top);
    const width = Math.min(
      Math.max(220 * scale, this.layout.width ?? 280 * scale),
      area.width - 16,
    );
    this.root.classList.toggle("sized", !!this.layout.height);
    this.root.style.width = `${width}px`;
    this.root.style.maxHeight = `${available}px`;
    this.root.style.height = this.layout.collapsed
      ? "auto"
      : this.layout.height
        ? `${Math.min(available, Math.max(100 * scale, this.layout.height))}px`
        : "auto";
    this.root.style.setProperty(
      "--inspector-content-max",
      `${Math.max(40, Math.min(available - 40 * scale, area.height * 0.55))}px`,
    );
    const height = this.root.getBoundingClientRect().height;
    this.root.style.left = `${Math.max(8, Math.min(area.width - width - 8, this.layout.x ?? area.width - width - 20 * scale))}px`;
    this.root.style.top = `${Math.max(top, Math.min(bottom - height, this.layout.y ?? bottom - height))}px`;
  }
  private bind(handle: HTMLElement, resize: boolean): void {
    const signal = this.abort.signal;
    let drag:
      | { x: number; y: number; left: number; top: number; width: number; height: number }
      | undefined;
    handle.addEventListener(
      "pointerdown",
      (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const rect = this.root.getBoundingClientRect(),
          area = this.app.getBoundingClientRect();
        drag = {
          x: event.clientX,
          y: event.clientY,
          left: rect.left - area.left,
          top: rect.top - area.top,
          width: rect.width,
          height: rect.height,
        };
        handle.setPointerCapture(event.pointerId);
      },
      { signal },
    );
    handle.addEventListener(
      "pointermove",
      (event) => {
        if (!drag) return;
        const dx = event.clientX - drag.x,
          dy = event.clientY - drag.y;
        Object.assign(
          this.layout,
          resize
            ? { x: drag.left, y: drag.top, width: drag.width + dx, height: drag.height + dy }
            : { x: drag.left + dx, y: drag.top + dy },
        );
        this.fit();
      },
      { signal },
    );
    handle.addEventListener(
      "lostpointercapture",
      () => {
        drag = undefined;
        this.remember();
      },
      { signal },
    );
    handle.addEventListener(
      "keydown",
      (event) => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        const rect = this.root.getBoundingClientRect(),
          area = this.app.getBoundingClientRect();
        const dx = event.key === "ArrowLeft" ? -16 : event.key === "ArrowRight" ? 16 : 0;
        const dy = event.key === "ArrowUp" ? -16 : event.key === "ArrowDown" ? 16 : 0;
        Object.assign(
          this.layout,
          resize
            ? {
                x: rect.left - area.left,
                y: rect.top - area.top,
                width: rect.width + dx,
                height: rect.height + dy,
              }
            : { x: rect.left - area.left + dx, y: rect.top - area.top + dy },
        );
        this.fit();
        this.remember();
      },
      { signal },
    );
  }
  private remember(): void {
    const rect = this.root.getBoundingClientRect(),
      area = this.app.getBoundingClientRect();
    this.layout.x = rect.left - area.left;
    this.layout.y = rect.top - area.top;
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
