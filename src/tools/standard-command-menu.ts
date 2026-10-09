import type { SketchEditor } from "../sketch/editor.js";
import { toolCatalog } from "./catalog.js";
import "../sketch/control-menu.css";
import "./standard-command-menu.css";

/** Browser equivalent of the desktop's ordinary File/Edit menus, including touch access. */
export class StandardCommandMenu {
  private wrapper = document.createElement("div");
  private trigger = document.createElement("button");
  private menu = document.createElement("div");
  constructor(private editor: SketchEditor) {
    if (window.makeshiftDocument) return;
    this.wrapper.className = "control-selector standard-command-selector";
    this.trigger.innerHTML = "<strong>Makeshift</strong>";
    this.trigger.setAttribute("aria-label", "File / Edit");
    this.trigger.setAttribute("aria-haspopup", "menu");
    this.trigger.setAttribute("aria-expanded", "false");
    this.menu.className = "control-menu";
    this.menu.popover = "auto";
    this.menu.setAttribute("role", "menu");
    this.menu.setAttribute("aria-label", "File and edit");
    this.wrapper.append(this.trigger);
    document.querySelector("header strong")?.replaceWith(this.wrapper);
    document.body.append(this.menu);
    this.trigger.onclick = () => {
      if (editor.interactions.current?.captured) return;
      if (this.menu.matches(":popover-open")) return this.menu.hidePopover();
      this.render();
      const box = this.trigger.getBoundingClientRect();
      this.menu.style.left = `${Math.max(8, Math.min(box.left, window.innerWidth - 230))}px`;
      this.menu.style.top = `${box.bottom + 8}px`;
      this.menu.showPopover();
      this.menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    };
    this.menu.ontoggle = () =>
      this.trigger.setAttribute("aria-expanded", String(this.menu.matches(":popover-open")));
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
  private update = (): void => {
    if (this.menu.matches(":popover-open")) this.render();
  };
  private render(): void {
    const focused = (document.activeElement as HTMLElement | null)?.dataset.command;
    this.menu.replaceChildren();
    for (const tool of toolCatalog(this.editor)
      .results()
      .filter((tool) => tool.showInTools === false)) {
      const button = document.createElement("button");
      button.textContent = `${tool.label}${tool.shortcut ? ` · ${tool.shortcut}` : ""}`;
      button.dataset.command = tool.id;
      button.setAttribute("role", "menuitem");
      button.disabled = !!tool.unavailable;
      button.title = tool.unavailable ?? "";
      button.onclick = () => {
        this.menu.hidePopover();
        this.trigger.focus();
        void toolCatalog(this.editor).invoke(tool.id);
      };
      this.menu.append(button);
      if (tool.id === focused && !button.disabled) button.focus();
    }
  }
  dispose(): void {
    this.editor.world.changed.delete(this.update);
    this.wrapper.remove();
    this.menu.remove();
  }
}
