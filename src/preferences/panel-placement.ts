interface Position {
  x: number;
  y: number;
}
const storageKey = "makeshift.panel-positions";
const positions: Record<string, Position> = {};
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
  for (const [key, value] of Object.entries(saved)) {
    const p = value as Position;
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) positions[key] = p;
  }
} catch {
  /* Storage is optional. */
}

const panels = new WeakMap<HTMLElement, FloatingPanel>();
export function placeFloatingPanel(element: HTMLElement): boolean {
  if (element.matches("button, input, .move-anchor")) return false;
  let panel = panels.get(element);
  if (!panel) {
    panel = new FloatingPanel(element);
    panels.set(element, panel);
  }
  return panel.place();
}

class FloatingPanel {
  private key: string;
  private grip = document.createElement("div");
  private drag: { id: number; x: number; y: number; origin: Position } | null = null;
  constructor(private element: HTMLElement) {
    this.key = `${element.parentElement?.className ?? ""}/${element.className}`;
    if (element.matches(".dimension, .revolve-quantity"))
      this.key += `/${element.querySelector("input")?.getAttribute("aria-label") ?? ""}`;
    this.grip.className = "parameter-panel-grip";
    this.grip.title = "Drag parameter panel";
    this.grip.setAttribute("aria-label", "Drag parameter panel");
    this.grip.setAttribute("role", "button");
    this.grip.tabIndex = 0;
    element.classList.add("draggable-parameter-panel");
    this.grip.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    this.grip.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || this.drag) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = element.getBoundingClientRect();
      this.drag = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        origin: { x: rect.x, y: rect.y },
      };
      this.grip.setPointerCapture(event.pointerId);
    });
    this.grip.addEventListener("pointermove", (event) => {
      if (this.drag?.id !== event.pointerId) return;
      event.stopPropagation();
      positions[this.key] = {
        x: this.drag.origin.x + event.clientX - this.drag.x,
        y: this.drag.origin.y + event.clientY - this.drag.y,
      };
      this.place();
      this.save();
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      this.grip.addEventListener(type, (event) => {
        event.stopPropagation();
        this.drag = null;
      });
    this.grip.addEventListener("keydown", (event) => {
      const delta = {
        ArrowLeft: [-10, 0],
        ArrowRight: [10, 0],
        ArrowUp: [0, -10],
        ArrowDown: [0, 10],
      }[event.key];
      if (!delta) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = element.getBoundingClientRect();
      positions[this.key] = { x: rect.x + delta[0], y: rect.y + delta[1] };
      this.place();
      this.save();
    });
  }
  place(): boolean {
    if (!this.element.contains(this.grip)) this.element.prepend(this.grip);
    const position = positions[this.key];
    if (!position) return false;
    const rect = this.element.getBoundingClientRect();
    const translation = getComputedStyle(this.element).translate.split(" ");
    const x = Number.parseFloat(translation[0]) || 0;
    const y = Number.parseFloat(translation[1]) || 0;
    const left = Math.max(24, Math.min(innerWidth - rect.width - 24, position.x));
    const top = Math.max(80, Math.min(innerHeight - rect.height - 24, position.y));
    this.element.style.transition = "none";
    this.element.style.translate = `${x + left - rect.x}px ${y + top - rect.y}px`;
    return true;
  }
  private save(): void {
    try {
      localStorage.setItem(storageKey, JSON.stringify(positions));
    } catch {
      /* Keep window state. */
    }
  }
}
