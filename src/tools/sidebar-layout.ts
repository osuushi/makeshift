import { uiScale } from "../preferences/ui-scale.js";

/** Reserve the toolbox's natural height before allocating space to the entity list. */
export class SidebarLayout {
  private observer: ResizeObserver;
  private frame = 0;
  constructor(
    private app: HTMLElement,
    private entities: HTMLElement,
    private toolbox: HTMLElement,
    private grid: HTMLElement,
  ) {
    this.observer = new ResizeObserver(this.schedule);
    for (const element of [app, entities, toolbox, grid, app.querySelector("header")])
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
    const scale = uiScale();
    const gap = 8 * scale;
    const bottom = this.app.getBoundingClientRect().bottom - 12 * scale;
    const entities = this.entities.getBoundingClientRect();
    const chrome =
      this.toolbox.getBoundingClientRect().height - this.grid.getBoundingClientRect().height;
    const toolsHeight = chrome + this.grid.scrollHeight;
    const style = getComputedStyle(this.entities);
    const minimum =
      (this.entities.querySelector("h2")?.getBoundingClientRect().height ?? 0) +
      Number.parseFloat(style.paddingTop) +
      Number.parseFloat(style.paddingBottom) +
      Number.parseFloat(style.borderTopWidth) +
      Number.parseFloat(style.borderBottomWidth);
    this.entities.style.maxHeight = `${Math.max(minimum, Math.floor(bottom - entities.top - gap - toolsHeight))}px`;
    const top = this.entities.getBoundingClientRect().bottom + gap;
    this.toolbox.style.top = `${top}px`;
    // Scroll tools only when they cannot fit even with Entities reduced to its title.
    this.grid.style.maxHeight = `${Math.max(34 * scale, Math.floor(bottom - top - chrome))}px`;
  }
  dispose(): void {
    this.observer.disconnect();
    cancelAnimationFrame(this.frame);
  }
}
