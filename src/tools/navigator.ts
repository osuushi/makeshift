import type { SketchEditor } from "../sketch/editor.js";
import { toolCatalog } from "./catalog.js";
import { borrowToolFocus, restoreToolFocus, toolMenuOpen } from "./menu-focus.js";
import { type GestureTarget, NavigatorGesture } from "./navigator-gesture.js";
import { navigatorKeydown } from "./navigator-keyboard.js";
import { navigatorGroups } from "./navigator-tree.js";
import { navigatorCard } from "./navigator-view.js";
import { toolSearchShortcut } from "./search-shortcut.js";
import "./navigator.css";

type Pointer = {
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  entry?: string;
  drag: boolean;
};
export class ToolNavigator {
  private trigger = document.createElement("button");
  private root = document.createElement("div");
  private panel = document.createElement("section");
  private heading = document.createElement("h2");
  private grid = document.createElement("div");
  private footer = document.createElement("div");
  private back = document.createElement("button");
  private abort = new AbortController();
  private history = ["root"];
  private gesture = new NavigatorGesture();
  private pointer: Pointer | null = null;
  private swallowClick = false;
  private signature = "";
  constructor(
    private editor: SketchEditor,
    app: HTMLElement,
  ) {
    this.trigger.className = "tools-trigger navigator-trigger";
    this.trigger.textContent = "▦ Browse tools";
    this.trigger.setAttribute("aria-haspopup", "dialog");
    this.trigger.setAttribute("aria-expanded", "false");
    this.root.className = "navigator-backdrop";
    this.root.hidden = true;
    this.panel.className = "tool-navigator";
    this.panel.setAttribute("role", "dialog");
    this.panel.setAttribute("aria-modal", "true");
    this.panel.setAttribute("aria-label", "Browse tools");
    this.heading.setAttribute("aria-live", "polite");
    const hint = document.createElement("p");
    hint.className = "navigator-hint";
    hint.textContent =
      "Tap a card, or glide through the green circles. Drag to the bottom bar to cancel.";
    this.grid.className = "navigator-grid";
    this.footer.className = "navigator-footer";
    this.back.textContent = "‹ Back";
    this.back.dataset.entry = "back";
    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    cancel.dataset.entry = "cancel";
    this.footer.append(this.back, cancel);
    this.panel.append(this.heading, hint, this.grid, this.footer);
    this.root.append(this.panel);
    app.append(this.root);
    this.bindEvents();
    editor.world.changed.add(this.update);
  }
  mountTrigger(host: HTMLElement): void {
    host.append(this.trigger);
  }
  private get visible(): boolean {
    return !this.root.hidden;
  }
  private open(): void {
    if (toolMenuOpen() || this.editor.isDragging || this.editor.interactions.current?.captured)
      return;
    for (const menu of document.querySelectorAll<HTMLElement>(".control-menu:popover-open"))
      menu.hidePopover();
    borrowToolFocus();
    this.history = ["root"];
    this.root.hidden = false;
    this.trigger.setAttribute("aria-expanded", "true");
    this.render();
  }
  private close(): void {
    if (!this.visible) return;
    this.root.hidden = true;
    this.trigger.setAttribute("aria-expanded", "false");
    restoreToolFocus();
  }
  private targets(): GestureTarget[] {
    return [...this.grid.querySelectorAll<HTMLElement>(".navigator-target")].map((element) => {
      const r = element.getBoundingClientRect();
      return {
        id: element.parentElement?.dataset.entry ?? "",
        x: r.x + r.width / 2,
        y: r.y + r.height / 2,
        radius: r.width / 2,
      };
    });
  }
  private choose(id: string): void {
    if (id === "cancel") this.close();
    else if (id === "back") {
      if (this.history.length > 1) {
        this.history.pop();
        this.render();
      }
    } else if (navigatorGroups[id]) {
      this.history.push(id);
      this.render();
    } else {
      const catalog = toolCatalog(this.editor);
      const tool = catalog.results().find((t) => t.id === id);
      if (!tool || catalog.reason(tool)) return;
      this.close();
      void catalog.invoke(id);
    }
  }
  private render(): void {
    const tools = toolCatalog(this.editor)
      .results()
      .filter((t) => t.showInTools !== false);
    const map = new Map(tools.map((t) => [t.id, t]));
    const group = navigatorGroups[this.history.at(-1) ?? "root"];
    this.heading.textContent = this.history.map((id) => navigatorGroups[id].label).join(" / ");
    this.back.disabled = this.history.length === 1;
    this.grid.replaceChildren(...group.entries.map((id) => navigatorCard(id, map)));
    this.signature = JSON.stringify(tools.map((t) => [t.id, t.unavailable]));
    if (this.pointer) this.gesture.reset(this.targets(), this.pointer.x, this.pointer.y);
    this.grid.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }
  private update = (): void => {
    if (!this.visible) return;
    const signature = JSON.stringify(
      toolCatalog(this.editor)
        .results()
        .filter((t) => t.showInTools !== false)
        .map((t) => [t.id, t.unavailable]),
    );
    if (signature !== this.signature) this.render();
  };
  private entry(target: EventTarget | null): string | undefined {
    return target instanceof Element
      ? target.closest<HTMLElement>("[data-entry]")?.dataset.entry
      : undefined;
  }
  private bindEvents(): void {
    const options = { capture: true, signal: this.abort.signal };
    window.addEventListener("pointerdown", this.down, options);
    window.addEventListener("pointermove", this.move, options);
    window.addEventListener("pointerup", this.up, options);
    window.addEventListener(
      "pointercancel",
      (event) => {
        if (this.pointer?.id !== event.pointerId) return;
        event.stopImmediatePropagation();
        this.pointer = null;
        this.close();
      },
      options,
    );
    window.addEventListener(
      "click",
      (event) => {
        const trigger = this.trigger.contains(event.target as Node);
        const suppress = this.swallowClick && event.detail !== 0;
        if (!trigger && !this.visible && !suppress) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (suppress) return;
        if (trigger) this.open();
        else {
          const id = this.entry(event.target);
          if (id) this.choose(id);
        }
      },
      options,
    );
    window.addEventListener(
      "touchend",
      (event) => {
        if (!this.visible && !this.swallowClick) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      { ...options, passive: false },
    );
    window.addEventListener(
      "dblclick",
      (event) => {
        if (!this.visible && !this.swallowClick) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      options,
    );
    window.addEventListener("keydown", this.keydown, options);
    window.addEventListener(
      "blur",
      (event) => {
        if (event.target !== window) return;
        this.pointer = null;
        this.close();
      },
      options,
    );
    window.addEventListener(
      "resize",
      () => {
        this.pointer = null;
        this.close();
      },
      options,
    );
  }
  private down = (event: PointerEvent): void => {
    if (this.pointer) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    this.swallowClick = false;
    const trigger = this.trigger.contains(event.target as Node);
    if (!this.visible && !trigger) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.button !== 0 || !event.isPrimary) return;
    if (trigger) this.open();
    if (!this.visible) return;
    this.pointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      entry: trigger ? undefined : this.entry(event.target),
      drag: false,
    };
    this.swallowClick = true;
    if (event.isTrusted) this.root.setPointerCapture(event.pointerId);
    this.gesture.reset(this.targets(), event.clientX, event.clientY);
    if (!trigger && !this.panel.contains(event.target as Node)) this.close();
  };
  private move = (event: PointerEvent): void => {
    const p = this.pointer;
    if (!p || p.id !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    p.x = event.clientX;
    p.y = event.clientY;
    p.drag ||= Math.hypot(p.x - p.startX, p.y - p.startY) > 8;
    if (!this.visible || !p.drag) return;
    const bar = this.footer.getBoundingClientRect();
    if (p.y >= bar.top && p.x >= bar.left && p.x <= bar.right) {
      this.close();
      return;
    }
    const id = this.gesture.enter(this.targets(), p.x, p.y);
    if (id) this.choose(id);
  };
  private up = (event: PointerEvent): void => {
    const p = this.pointer;
    if (!p || p.id !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const end = this.entry(document.elementFromPoint(event.clientX, event.clientY));
    this.pointer = null;
    if (this.visible && !p.drag && p.entry && p.entry === end) this.choose(p.entry);
  };
  private keydown = (event: KeyboardEvent): void => {
    if (!this.visible) return;
    if (toolSearchShortcut(event)) {
      this.close();
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.isComposing) return;
    navigatorKeydown(event, this.panel, (id) => this.choose(id));
  };
  dispose(): void {
    this.close();
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.trigger.remove();
    this.root.remove();
  }
}
