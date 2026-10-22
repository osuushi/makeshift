import type { ToolboxDrop, ToolboxPath } from "./toolbox-tree.js";
export interface ToolboxDropTarget {
  path: ToolboxPath;
  mode: ToolboxDrop;
}
/** Shared pointer editing for flyouts and the expanded settings tree, including touch. */
export class ToolboxDrag {
  private abort = new AbortController();
  private press: { id: number; path: ToolboxPath; x: number; y: number; label: string } | null =
    null;
  private active = false;
  private target: ToolboxDropTarget | null = null;
  private marker: HTMLElement | null = null;
  private ghost: HTMLElement | null = null;
  private hoverTimer: ReturnType<typeof setTimeout> | undefined;
  private hoverPath = "";
  constructor(
    private host: HTMLElement,
    private drop: (from: ToolboxPath, target: ToolboxDropTarget) => void,
    private expand: (path: ToolboxPath, row: HTMLElement) => void = () => {},
    private finish: () => void = () => {},
  ) {
    const options = { capture: true, signal: this.abort.signal };
    host.addEventListener("pointerdown", this.down, options);
    window.addEventListener("pointermove", this.move, options);
    window.addEventListener("pointerup", this.up, options);
    window.addEventListener("pointercancel", this.cancel, options);
    window.addEventListener("blur", this.cancel, { signal: this.abort.signal });
    window.addEventListener(
      "keydown",
      (event) => {
        if (this.active && event.key === "Escape") {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.cancel();
        }
      },
      options,
    );
  }
  get dragging(): boolean {
    return this.active;
  }
  private down = (event: PointerEvent): void => {
    const row = (event.target as Element).closest<HTMLElement>("[data-toolbox-path]");
    if (
      !row ||
      row.dataset.toolboxFixed ||
      row.dataset.toolboxAnchored ||
      event.button !== 0 ||
      !event.isPrimary ||
      (event.target as Element).closest("[data-no-drag]")
    )
      return;
    event.preventDefault();
    this.press = {
      id: event.pointerId,
      path: JSON.parse(row.dataset.toolboxPath ?? "[]"),
      x: event.clientX,
      y: event.clientY,
      label: row.dataset.label ?? "Tool",
    };
  };
  private move = (event: PointerEvent): void => {
    const p = this.press;
    if (!p || p.id !== event.pointerId) return;
    if (!this.active && Math.hypot(event.clientX - p.x, event.clientY - p.y) < 8) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.active = true;
    if (!this.ghost) {
      this.ghost = document.createElement("div");
      this.ghost.className = "toolbox-drag-ghost";
      this.ghost.textContent = p.label;
      this.host.append(this.ghost);
    }
    this.ghost.style.left = `${event.clientX + 14}px`;
    this.ghost.style.top = `${event.clientY + 10}px`;
    this.marker?.removeAttribute("data-drop");
    this.marker = null;
    this.target = null;
    const row = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-toolbox-path]");
    if (!row || row.dataset.toolboxFixed || !this.host.contains(row)) {
      this.clearHover();
      return;
    }
    const path: ToolboxPath = JSON.parse(row.dataset.toolboxPath ?? "[]");
    if (p.path.length <= path.length && p.path.every((v, i) => path[i] === v)) {
      this.clearHover();
      return;
    }
    const rect = row.getBoundingClientRect();
    const fraction = (event.clientY - rect.top) / rect.height;
    const mode: ToolboxDrop = row.dataset.rootDrop
      ? "inside"
      : fraction < 0.25
        ? "before"
        : fraction > 0.75
          ? "after"
          : "inside";
    this.target = { path, mode };
    this.marker = row;
    row.dataset.drop = mode;
    const key = JSON.stringify(path);
    if (row.dataset.group && key !== this.hoverPath) {
      this.clearHover();
      this.hoverPath = key;
      this.hoverTimer = setTimeout(() => this.expand(path, row), 250);
    } else if (!row.dataset.group) this.clearHover();
  };
  private up = (event: PointerEvent): void => {
    if (!this.press || event.pointerId !== this.press.id) return;
    if (!this.active) {
      this.press = null;
      // WebKit suppresses the compatibility click after our prevented pointerdown.
      if (event.pointerType === "touch") {
        event.preventDefault();
        event.stopImmediatePropagation();
        (event.target as Element).closest<HTMLButtonElement>("button")?.click();
        this.swallowClick();
      }
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const from = this.press.path,
      target = this.target;
    this.cancel();
    if (target) this.drop(from, target);
    this.swallowClick();
  };
  private swallowClick(): void {
    // Pointerup may synthesize a click on a new row; consume it for this task only.
    const swallow = (click: MouseEvent) => {
      click.preventDefault();
      click.stopImmediatePropagation();
    };
    window.addEventListener("click", swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener("click", swallow, true), 0);
  }
  private clearHover(): void {
    clearTimeout(this.hoverTimer);
    this.hoverPath = "";
  }
  private cancel = (): void => {
    const wasActive = this.active;
    this.press = null;
    this.active = false;
    this.target = null;
    this.marker?.removeAttribute("data-drop");
    this.marker = null;
    this.ghost?.remove();
    this.ghost = null;
    this.clearHover();
    if (wasActive) this.finish();
  };
  dispose(): void {
    this.cancel();
    this.abort.abort();
  }
}
