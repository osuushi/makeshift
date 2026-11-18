import type { SketchEditor } from "../sketch/editor.js";
import { toolCatalog } from "./catalog.js";
import "../sketch/control-menu.css";
import "./standard-command-menu.css";

/** Browser equivalent of the desktop's ordinary File/Edit menus, including touch access. */
export class StandardCommandMenu {
  private wrapper = document.createElement("div");
  private activeTrigger?: HTMLButtonElement;
  private abort = new AbortController();
  private menu = document.createElement("div");
  constructor(
    private editor: SketchEditor,
    private exchange?: "Import" | "Export",
  ) {
    this.menu.className = "control-menu standard-command-menu";
    this.menu.popover = "auto";
    this.menu.setAttribute("role", "menu");
    this.menu.setAttribute("aria-label", exchange ?? "File and edit");
    if (exchange) {
      const trigger = document.createElement("button");
      trigger.textContent = exchange;
      this.wrapper.className = "control-selector standard-command-selector";
      this.wrapper.append(trigger);
      document.querySelector(".exchange-menus")?.append(this.wrapper);
      this.bind(trigger, exchange);
    } else {
      for (const trigger of document.querySelectorAll<HTMLButtonElement>(
        "button.brand, .toolbar-app-menu",
      ))
        this.bind(trigger, "File / Edit");
    }
    document.body.append(this.menu);
    this.menu.ontoggle = () =>
      this.activeTrigger?.setAttribute("aria-expanded", String(this.menu.matches(":popover-open")));
    this.menu.onkeydown = (event) => {
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const buttons = [...this.menu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? buttons.length - 1
            : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    };
    editor.world.changed.add(this.update);
  }
  private bind(trigger: HTMLButtonElement, label: string) {
    trigger.setAttribute("aria-label", label);
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", "false");
    trigger.addEventListener(
      "click",
      () => {
        if (this.editor.interactions.current?.captured) return;
        if (this.menu.matches(":popover-open")) return this.menu.hidePopover();
        this.activeTrigger = trigger;
        this.render();
        this.menu.showPopover();
        const anchor = trigger.getBoundingClientRect();
        const { width, height } = this.menu.getBoundingClientRect();
        this.menu.style.left = `${Math.max(4, Math.min(anchor.left, innerWidth - width - 4))}px`;
        this.menu.style.top = `${Math.max(4, Math.min(anchor.bottom + 4, innerHeight - height - 4))}px`;
        this.menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
      },
      { signal: this.abort.signal },
    );
  }
  private update = (): void => {
    if (this.menu.matches(":popover-open")) this.render();
  };
  private render(): void {
    const focused = (document.activeElement as HTMLElement | null)?.dataset.command;
    this.menu.replaceChildren();
    for (const tool of toolCatalog(this.editor)
      .results()
      .filter((tool) =>
        this.exchange
          ? tool.id.startsWith(`${this.exchange.toLowerCase()}-`)
          : tool.showInTools === false,
      )) {
      const button = document.createElement("button");
      button.textContent = `${tool.label}${tool.shortcut ? ` · ${tool.shortcut}` : ""}`;
      button.dataset.command = tool.id;
      button.setAttribute("role", "menuitem");
      button.disabled = !!tool.unavailable;
      button.title = tool.unavailable ?? "";
      button.onclick = () => {
        this.menu.hidePopover();
        this.activeTrigger?.focus();
        void toolCatalog(this.editor).invoke(tool.id);
      };
      this.menu.append(button);
      if (tool.id === focused && !button.disabled) button.focus();
    }
  }
  dispose(): void {
    this.editor.world.changed.delete(this.update);
    this.abort.abort();
    this.wrapper.remove();
    this.menu.remove();
  }
}
