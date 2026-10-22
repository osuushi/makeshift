import { onToolboxChange, setToolboxTree, toolboxTree } from "../preferences/toolbox.js";
import type { SketchEditor } from "../sketch/editor.js";
import { type ToolResult, toolCatalog } from "./catalog.js";
import { borrowToolFocus, restoreToolFocus, toolMenuOpen } from "./menu-focus.js";
import { toolSearchShortcut } from "./search-shortcut.js";
import { ToolboxDrag } from "./toolbox-drag.js";
import { toolboxRow } from "./toolbox-row.js";
import {
  findToolboxPath,
  moveToolboxItem,
  selectToolboxPath,
  type ToolboxPath,
  toolboxItem,
  toolboxLeaf,
} from "./toolbox-tree.js";
import "./toolbox.css";

/** A single owned tree; each row launches its remembered leaf or exposes alternatives. */
export class Toolbox {
  private root = document.createElement("aside");
  private grid = document.createElement("div");
  private observer: ResizeObserver;
  private abort = new AbortController();
  private drag: ToolboxDrag;
  private disposePreference: () => void;
  private menus: { path: ToolboxPath; element: HTMLElement }[] = [];
  private tools = new Map<string, ToolResult>();
  private signature = "";
  private choice: { readonly id: string } | null = null;
  private hoverBlock: { x: number; y: number } | null = null;
  private borrowed = false;
  private closeTimer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private editor: SketchEditor,
    app: HTMLElement,
    private entities: HTMLElement,
    mountMore: (host: HTMLElement) => void,
  ) {
    this.root.className = "toolbox";
    this.root.setAttribute("aria-label", "Toolbox");
    const title = document.createElement("strong");
    title.textContent = "Tools";
    this.grid.className = "toolbox-grid";
    const footer = document.createElement("div");
    footer.className = "toolbox-footer";
    mountMore(footer);
    this.root.append(title, this.grid, footer);
    app.append(this.root);
    this.drag = new ToolboxDrag(
      this.root,
      (from, target) => {
        setToolboxTree(moveToolboxItem(toolboxTree(), from, target.path, target.mode));
      },
      (path, row) => this.expand(path, row),
      () => this.close(),
    );
    this.observer = new ResizeObserver(this.position);
    this.observer.observe(entities);
    window.addEventListener("resize", this.position, { signal: this.abort.signal });
    this.root.addEventListener("pointerleave", (event) => {
      this.hoverBlock = null;
      if (event.pointerType !== "touch" && !this.drag.dragging)
        this.closeTimer = setTimeout(() => this.close(), 240);
    });
    this.root.addEventListener("pointerenter", () => clearTimeout(this.closeTimer));
    window.addEventListener(
      "pointerdown",
      (event) => {
        if (!this.root.contains(event.target as Node)) this.close();
      },
      { capture: true, signal: this.abort.signal },
    );
    this.root.addEventListener("keydown", this.keydown);
    window.addEventListener(
      "keydown",
      (event) => {
        if (!this.menus.length || this.drag.dragging) return;
        if (toolSearchShortcut(event)) this.close();
        else if (event.key === "Escape") {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.close();
        }
      },
      { capture: true, signal: this.abort.signal },
    );
    this.disposePreference = onToolboxChange(() => {
      this.signature = "";
      this.update();
    });
    editor.world.changed.add(this.update);
    this.update();
  }
  private position = (): void => {
    const bounds = this.entities.getBoundingClientRect(),
      top = Math.ceil(bounds.bottom + 8);
    this.root.style.top = `${top}px`;
    const chrome =
      this.root.getBoundingClientRect().height - this.grid.getBoundingClientRect().height;
    this.grid.style.maxHeight = `${Math.max(60, window.innerHeight - top - chrome - 12)}px`;
  };
  private update = (): void => {
    const catalog = toolCatalog(this.editor)
      .results()
      .filter((tool) => tool.showInTools !== false);
    this.tools = new Map(catalog.map((tool) => [tool.id, tool]));
    this.root.dataset.mode = this.editor.world.active ? "sketch" : "modeling";
    const choice = toolCatalog(this.editor).lastChoice;
    if (choice !== this.choice) {
      this.choice = choice;
      const path = choice && findToolboxPath(toolboxTree(), choice.id);
      if (path) setToolboxTree(selectToolboxPath(toolboxTree(), path));
    }
    const signature = JSON.stringify([
      toolboxTree(),
      catalog.map((tool) => [tool.id, tool.unavailable]),
      this.editor.tool,
      this.editor.modeling.tool,
      this.editor.interactions.current?.kind,
      this.editor.interactions.toolId,
    ]);
    if (signature === this.signature || this.drag.dragging) return;
    this.signature = signature;
    this.close();
    this.grid.replaceChildren(...toolboxTree().items.map((_, index) => this.row([index])));
    this.position();
  };
  private activeTool(): string {
    const source = this.editor.interactions.toolId;
    if (source && source !== this.editor.interactions.current?.kind && this.tools.has(source))
      return source;
    if (this.editor.world.active) return this.editor.moveMode ? "transform" : this.editor.tool;
    const kind = this.editor.interactions.current?.kind;
    if (kind === "face-offset") return "offset";
    if (kind && this.tools.has(kind)) return kind;
    return this.editor.modeling.tool === "move"
      ? "transform"
      : (this.editor.modeling.tool ?? "select");
  }
  private row(path: ToolboxPath): HTMLElement {
    const item = toolboxItem(toolboxTree(), path);
    if (item === undefined) throw new Error("Missing toolbox item");
    const row = toolboxRow(
      item,
      path,
      this.tools,
      (event) => {
        this.hoverBlock = { x: event.clientX, y: event.clientY };
        void this.activate(path);
      },
      () => this.expand(path, row),
    );
    const leaf = toolboxLeaf(item);
    const active = this.activeTool();
    row.querySelector(".toolbox-item")?.setAttribute("aria-pressed", String(leaf === active));
    row.addEventListener("pointerenter", (event) => {
      clearTimeout(this.closeTimer);
      if (event.pointerType === "touch" || this.drag.dragging) return;
      // Replacing a row under a stationary pointer must not reopen after activation.
      const block = this.hoverBlock;
      if (block && Math.hypot(event.clientX - block.x, event.clientY - block.y) < 2) return;
      this.hoverBlock = null;
      if (typeof item !== "string") this.expand(path, row);
      else if (path.length === 1) this.close();
      else this.trim(path.length - 1);
    });
    return row;
  }
  private async activate(path: ToolboxPath): Promise<void> {
    const item = toolboxItem(toolboxTree(), path);
    if (item === undefined) return;
    const tool = this.tools.get(toolboxLeaf(item));
    if (!tool || toolCatalog(this.editor).reason(tool)) return;
    this.close();
    await toolCatalog(this.editor).activate(tool);
  }
  private expand(path: ToolboxPath, row: HTMLElement): void {
    if (this.editor.interactions.current?.captured || this.editor.isDragging) return;
    const item = toolboxItem(toolboxTree(), path);
    if (!item || typeof item === "string") return;
    const depth = path.length - 1;
    if (JSON.stringify(this.menus[depth]?.path) === JSON.stringify(path)) return;
    if (!this.borrowed) {
      if (toolMenuOpen()) return;
      borrowToolFocus();
      this.borrowed = true;
    }
    this.trim(depth);
    const menu = document.createElement("div");
    menu.className = "toolbox-flyout";
    menu.setAttribute("role", "menu");
    menu.setAttribute(
      "aria-label",
      `Alternatives for ${this.tools.get(toolboxLeaf(item))?.label ?? toolboxLeaf(item)}`,
    );
    menu.append(...item.items.map((_, index) => this.row([...path, index])));
    this.root.append(menu);
    this.menus.push({ path, element: menu });
    const anchor = row.getBoundingClientRect(),
      bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(4, Math.min(anchor.right, window.innerWidth - bounds.width - 4))}px`;
    menu.style.top = `${Math.max(4, Math.min(anchor.top, window.innerHeight - bounds.height - 4))}px`;
  }
  private trim(depth: number): void {
    for (const menu of this.menus.splice(depth)) menu.element.remove();
  }
  private close = (): void => {
    clearTimeout(this.closeTimer);
    this.trim(0);
    if (this.borrowed) {
      restoreToolFocus();
      this.borrowed = false;
    }
  };
  private keydown = (event: KeyboardEvent): void => {
    const row = (event.target as Element).closest<HTMLElement>("[data-toolbox-path]");
    if (!row) return;
    const path: ToolboxPath = JSON.parse(row.dataset.toolboxPath ?? "[]");
    if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Escape"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") this.close();
    else if (event.key === "ArrowRight") {
      if (row.dataset.group) {
        this.expand(path, row);
        this.menus.at(-1)?.element.querySelector<HTMLButtonElement>("button")?.focus();
      }
    } else if (event.key === "ArrowLeft") {
      if (path.length <= 2) this.close();
      else this.trim(path.length - 2);
      this.root
        .querySelector<HTMLElement>(
          `[data-toolbox-path='${JSON.stringify(path.slice(0, -1))}'] button`,
        )
        ?.focus();
    } else {
      const siblings = [
        ...(row.parentElement?.querySelectorAll<HTMLElement>(":scope > .toolbox-row") ?? []),
      ];
      const index = siblings.indexOf(row),
        delta = event.key === "ArrowDown" ? 1 : -1;
      siblings[(index + delta + siblings.length) % siblings.length]
        ?.querySelector("button")
        ?.focus();
    }
  };
  dispose(): void {
    this.drag.dispose();
    this.close();
    this.disposePreference();
    this.abort.abort();
    this.observer.disconnect();
    this.editor.world.changed.delete(this.update);
    this.root.remove();
  }
}
