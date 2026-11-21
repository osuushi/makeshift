import type { BenchEdit } from "../model/benches.js";
import { validName } from "../security/text.js";
import { toolCatalog } from "../tools/catalog.js";
import type { SketchEditor } from "./editor.js";
import { sketchIcon } from "./sketch-icons.js";
import "./bench-tabs.css";

export class BenchTabs {
  private strip = document.createElement("div");
  private tabs = document.createElement("div");
  private add = document.createElement("button");
  private buttons = new Map<string, HTMLButtonElement>();
  private tools: (() => void)[];

  constructor(
    private editor: SketchEditor,
    toolbar: HTMLElement,
  ) {
    this.strip.className = "bench-strip";
    this.tabs.className = "bench-tabs";
    this.tabs.setAttribute("role", "tablist");
    this.tabs.setAttribute("aria-label", "Benches");
    this.tabs.onkeydown = this.keydown;
    this.add.type = "button";
    this.add.className = "bench-add";
    this.add.setAttribute("aria-label", "New bench");
    this.add.append(sketchIcon("add"));
    this.add.onclick = () => this.apply({ action: "create" });
    this.strip.append(this.tabs, this.add);
    toolbar.append(this.strip);

    const catalog = toolCatalog(editor);
    this.tools = [
      catalog.register({
        id: "new-bench",
        label: "New bench",
        category: "Document & Edit",
        finishEdit: false,
        reason: this.unavailable,
        run: () => this.request({ action: "create" }),
      }),
      catalog.register({
        id: "rename-bench",
        label: "Rename bench",
        category: "Document & Edit",
        finishEdit: false,
        reason: this.unavailable,
        run: () => this.rename(editor.store.activeBench),
      }),
    ];
    editor.world.changed.add(this.update);
    this.update();
  }

  dispose(): void {
    for (const dispose of this.tools) dispose();
    this.editor.world.changed.delete(this.update);
    this.strip.remove();
  }

  private unavailable = () =>
    this.editor.workspaceEntry.reason() ??
    (this.editor.world.navigation.dragging
      ? "Finish the current drag first"
      : this.editor.world.cameraTransitioning
        ? "Wait for the view to settle"
        : null);

  private focus(id = this.editor.store.activeBench): void {
    const button = this.buttons.get(id);
    button?.focus({ preventScroll: true });
    button?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  private apply(edit: BenchEdit): void {
    if (this.unavailable()) return;
    void toolCatalog(this.editor).activate({
      finishEdit: false,
      reason: this.unavailable,
      run: () => this.request(edit),
    });
  }

  private async request(edit: BenchEdit): Promise<boolean> {
    if (this.unavailable()) return false;
    const changed = await this.editor.store.request({ kind: "bench", edit });
    if (changed) this.focus(edit.action === "rename" ? edit.id : undefined);
    return changed;
  }

  private rename(id: string): void {
    if (this.unavailable() || this.tabs.querySelector("input")) return;
    const button = this.buttons.get(id);
    if (!button) return;
    const input = document.createElement("input");
    input.className = "bench-name";
    input.setAttribute("aria-label", "Bench name");
    input.maxLength = 192;
    input.value = button.textContent ?? "";
    button.hidden = true;
    button.after(input);
    const finish = (save: boolean) => {
      if (!input.isConnected) return;
      const name = input.value.trim();
      if (save && !validName(name)) {
        input.setCustomValidity("Use up to 96 printable characters.");
        input.reportValidity();
        return;
      }
      input.onblur = null;
      input.remove();
      button.hidden = false;
      if (save && name !== button.textContent) this.apply({ action: "rename", id, name });
      else this.focus(id);
    };
    input.onblur = () => {
      input.remove();
      button.hidden = false;
    };
    input.oninput = () => input.setCustomValidity("");
    input.onkeydown = (event) => {
      if (event.key !== "Enter" && event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      finish(event.key === "Enter");
    };
    input.focus();
    input.select();
  }

  private update = (): void => {
    const current = this.editor.store.activeBench;
    const visible = this.editor.store.benchTabs;
    const reason = toolCatalog(this.editor).switching ? "Switching tools…" : this.unavailable();
    const ids = new Set(visible.map(({ id }) => id));
    for (const [id, button] of this.buttons) {
      if (ids.has(id)) continue;
      if (button.nextElementSibling instanceof HTMLInputElement) button.nextElementSibling.remove();
      button.remove();
      this.buttons.delete(id);
    }
    for (const { id, name } of visible) {
      let button = this.buttons.get(id);
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.setAttribute("role", "tab");
        button.setAttribute("aria-controls", "world");
        button.onclick = () => {
          if (id !== this.editor.store.activeBench) this.apply({ action: "switch", id });
        };
        button.ondblclick = () => this.rename(id);
        this.buttons.set(id, button);
        this.tabs.append(button);
      }
      if (button.textContent !== name) button.textContent = name;
      button.title = reason ?? `${name} · Double-click or press F2 to rename`;
      button.setAttribute("aria-selected", String(id === current));
      button.tabIndex = id === current ? 0 : -1;
      button.setAttribute("aria-disabled", String(reason !== null));
    }
    this.add.setAttribute("aria-disabled", String(reason !== null));
    this.add.title = reason ?? "New bench";
  };

  private keydown = (event: KeyboardEvent): void => {
    const visible = this.editor.store.benchTabs;
    const current = visible.findIndex(({ id }) => this.buttons.get(id) === event.target);
    if (current < 0) return;
    let index: number;
    switch (event.key) {
      case "Home":
        index = 0;
        break;
      case "End":
        index = visible.length - 1;
        break;
      case "ArrowLeft":
        index = (current + visible.length - 1) % visible.length;
        break;
      case "ArrowRight":
        index = (current + 1) % visible.length;
        break;
      case "F2":
        event.preventDefault();
        event.stopPropagation();
        this.rename(visible[current].id);
        return;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.apply({ action: "switch", id: visible[index].id });
  };
}
