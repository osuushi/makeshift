import type { SketchEditor } from "../sketch/editor.js";
import { type Category, categories, type ToolResult, toolCatalog } from "./catalog.js";
import { borrowToolFocus, restoreToolFocus, toolMenuOpen } from "./menu-focus.js";
import { ToolMenuList, toolShortcut } from "./menu-list.js";
import { searchTools } from "./search.js";
import "./menu.css";

export class ToolMenu {
  private trigger = document.createElement("button");
  private backdrop = document.createElement("div");
  private panel = document.createElement("section");
  private input = document.createElement("input");
  private back = document.createElement("button");
  private list = document.createElement("div");
  private abort = new AbortController();
  private category: Category | null = null;
  private results = new ToolMenuList(this.list, this.input);
  private signature = "";
  constructor(
    private editor: SketchEditor,
    app: HTMLElement,
  ) {
    this.trigger.className = "tools-trigger";
    this.trigger.innerHTML = `Tools <kbd>${toolShortcut("⌘F")}</kbd>`;
    this.trigger.setAttribute("aria-label", "Tools");
    this.trigger.setAttribute("aria-haspopup", "dialog");
    this.trigger.setAttribute("aria-expanded", "false");
    this.backdrop.className = "tool-menu-backdrop";
    this.backdrop.hidden = true;
    this.panel.className = "tool-menu";
    this.panel.setAttribute("role", "dialog");
    this.panel.setAttribute("aria-modal", "true");
    this.panel.setAttribute("aria-label", "Find a tool");
    this.input.type = "search";
    this.input.placeholder = "Find a tool…";
    this.input.setAttribute("aria-label", "Find a tool");
    this.input.setAttribute("role", "combobox");
    this.input.setAttribute("aria-controls", "tool-results");
    this.input.setAttribute("aria-expanded", "true");
    this.input.autocomplete = "off";
    this.input.spellcheck = false;
    this.list.id = "tool-results";
    this.list.setAttribute("role", "listbox");
    this.list.setAttribute("aria-label", "Tools and categories");
    this.back.className = "tool-menu-back";
    this.back.onclick = () => {
      this.category = null;
      this.input.value = "";
      this.render(true);
      this.input.focus();
    };
    this.input.oninput = () => this.render(true);
    this.panel.append(this.input, this.back, this.list);
    this.backdrop.append(this.panel);
    app.append(this.trigger, this.backdrop);
    this.trigger.onclick = () => this.open();
    this.bindEvents();
    editor.world.changed.add(this.update);
  }
  private bindEvents(): void {
    const options = { capture: true, signal: this.abort.signal };
    window.addEventListener("keydown", this.keydown, options);
    window.addEventListener(
      "touchend",
      (event) => {
        if (!this.trigger.contains(event.target as Node)) return;
        // WebKit suppresses the compatibility click after the prevented pointerdown.
        event.preventDefault();
        event.stopImmediatePropagation();
        this.open();
      },
      { ...options, passive: false },
    );
    // Stop document-level outside-click handlers from accepting/cancelling local edits.
    window.addEventListener(
      "pointerdown",
      (event) => {
        if (event.target === this.trigger || this.trigger.contains(event.target as Node)) {
          event.preventDefault();
          event.stopImmediatePropagation();
        } else if (toolMenuOpen()) {
          event.stopImmediatePropagation();
          if (!this.panel.contains(event.target as Node)) event.preventDefault();
        }
      },
      options,
    );
    window.addEventListener(
      "click",
      (event) => {
        if (this.trigger.contains(event.target as Node)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.open();
          return;
        }
        if (toolMenuOpen() && !this.panel.contains(event.target as Node)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.close();
        }
      },
      options,
    );
  }
  private open(): void {
    if (this.editor.isDragging || toolMenuOpen()) return;
    for (const menu of document.querySelectorAll<HTMLElement>(".control-menu:popover-open"))
      menu.hidePopover();
    borrowToolFocus();
    this.category = null;
    this.input.value = "";
    this.backdrop.hidden = false;
    this.trigger.setAttribute("aria-expanded", "true");
    this.render(true);
    this.input.focus();
  }
  private close(): void {
    this.backdrop.hidden = true;
    this.trigger.setAttribute("aria-expanded", "false");
    restoreToolFocus();
  }
  private keydown = (event: KeyboardEvent): void => {
    if (event.target instanceof Element && event.target.closest(".agent-dock, dialog[open]"))
      return;
    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "f") {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!toolMenuOpen()) this.open();
      else this.input.focus();
      return;
    }
    if (!toolMenuOpen()) return;
    event.stopImmediatePropagation();
    if (event.isComposing) return;
    const key = event.key;
    if (["Escape", "ArrowDown", "ArrowUp", "Enter", "Tab"].includes(key)) event.preventDefault();
    if (key === "Escape") this.close();
    else if (key === "ArrowDown" || key === "ArrowUp") {
      this.results.selected =
        (this.results.selected + (key === "ArrowDown" ? 1 : -1) + this.results.rows.length) %
        Math.max(1, this.results.rows.length);
      this.results.highlight();
    } else if (key === "Enter" && document.activeElement === this.back) {
      this.category = null;
      this.input.value = "";
      this.render(true);
      this.input.focus();
    } else if (key === "Enter") this.results.rows[this.results.selected]?.activate();
    else if (key === "ArrowLeft" && document.activeElement !== this.input && this.category) {
      event.preventDefault();
      this.category = null;
      this.render(true);
      this.input.focus();
    } else if (
      key === "ArrowRight" &&
      !this.input.value &&
      !this.category &&
      categories.some(([category]) => category === this.results.rows[this.results.selected]?.id)
    ) {
      event.preventDefault();
      this.results.rows[this.results.selected]?.activate();
    } else if (key === "Tab") {
      const controls = [this.input, ...(this.back.hidden ? [] : [this.back])];
      const index = controls.indexOf(document.activeElement as HTMLInputElement);
      controls[(index + 1) % controls.length].focus();
    }
  };
  private update = (): void => {
    if (toolMenuOpen()) this.render(false);
  };
  private render(reset: boolean): void {
    const catalog = toolCatalog(this.editor);
    const recent = catalog.recent();
    const tools = catalog.results().filter((tool) => tool.showInTools !== false);
    const query = this.input.value;
    const signature = JSON.stringify([
      query,
      this.category,
      recent.map((tool) => tool.id),
      tools.map((t) => [t.id, t.label, t.unavailable]),
    ]);
    if (!reset && signature === this.signature) return;
    this.signature = signature;
    const prior = reset ? null : this.results.rows[this.results.selected]?.id;
    this.results.reset();
    this.back.hidden = !this.category;
    this.back.textContent = `‹ All tools / ${this.category ?? ""}`;
    if (!query.trim() && !this.category) {
      if (recent.length) {
        this.results.heading("Recent");
        for (const tool of recent) this.toolRow(tool);
        this.results.heading("Categories");
      }
      for (const [category, description] of categories) {
        if (!tools.some((t) => t.category === category)) continue;
        this.results.row(category, category, description, false, "›", () => {
          this.category = category;
          this.render(true);
          this.input.focus();
        });
      }
    } else {
      const results = searchTools(
        query.trim() ? tools : tools.filter((t) => t.category === this.category),
        query,
      );
      let disabled = false;
      for (const { tool, explanation } of results) {
        if (tool.unavailable && !disabled) {
          disabled = true;
          this.results.heading("Unavailable in this context");
        }
        this.toolRow(tool, explanation);
      }
      if (!results.length) {
        const empty = document.createElement("p");
        empty.textContent = "No matching tools. Try another name or browse a category.";
        this.list.append(empty);
      }
    }
    this.results.selected = Math.max(
      0,
      this.results.rows.findIndex((r) => r.id === prior),
    );
    this.results.highlight();
  }
  private toolRow(tool: ToolResult, explanation?: string): void {
    this.results.row(
      tool.id,
      tool.label,
      [tool.category, explanation || tool.description, tool.unavailable]
        .filter(Boolean)
        .join(" · "),
      !!tool.unavailable,
      tool.shortcut ?? "",
      () => {
        if (toolCatalog(this.editor).reason(tool)) return;
        this.close();
        void toolCatalog(this.editor).invoke(tool.id);
      },
    );
  }
  dispose(): void {
    if (toolMenuOpen()) this.close();
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.trigger.remove();
    this.backdrop.remove();
  }
}
