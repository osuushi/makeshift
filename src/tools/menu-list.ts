import { drillIcon } from "./drill-icon.js";

/** Rendering and keyboard highlight for one flat, accessible menu list. */
export class ToolMenuList {
  rows: { id: string; element: HTMLButtonElement; activate: () => void }[] = [];
  selected = 0;
  constructor(
    readonly element: HTMLElement,
    private input: HTMLInputElement,
  ) {}
  reset(): void {
    this.rows = [];
    this.element.replaceChildren();
  }
  heading(label: string): void {
    const heading = document.createElement("div");
    heading.className = "tool-menu-divider";
    heading.textContent = label;
    this.element.append(heading);
  }
  row(
    id: string,
    label: string,
    detail: string,
    disabled: boolean,
    key: string,
    activate: () => void,
  ): void {
    const element = document.createElement("button");
    element.type = "button";
    element.tabIndex = -1;
    element.id = `tool-result-${this.rows.length}`;
    element.dataset.command = id;
    element.setAttribute("role", "option");
    element.setAttribute("aria-label", label);
    element.setAttribute("aria-disabled", String(disabled));
    const title = document.createElement("strong"),
      description = document.createElement("small"),
      shortcut = document.createElement("kbd");
    title.textContent = label;
    if (id === "drill") title.prepend(drillIcon());
    description.textContent = detail;
    shortcut.textContent = toolShortcut(key);
    element.append(title, shortcut, description);
    const index = this.rows.length;
    element.onclick = () => {
      this.selected = index;
      this.highlight(false);
      activate();
    };
    element.onpointermove = () => {
      this.selected = index;
      this.highlight(false);
    };
    this.rows.push({ id, element, activate });
    this.element.append(element);
  }
  highlight(scroll = true): void {
    this.rows.forEach((row, index) => {
      row.element.setAttribute("aria-selected", String(index === this.selected));
    });
    const row = this.rows[this.selected];
    if (row) {
      this.input.setAttribute("aria-activedescendant", row.element.id);
      if (scroll) row.element.scrollIntoView({ block: "nearest" });
    } else this.input.removeAttribute("aria-activedescendant");
  }
}
export function toolShortcut(value: string): string {
  return /Mac|iPhone|iPad/.test(navigator.platform)
    ? value
    : value.replaceAll("⇧", "Shift+").replaceAll("⌘", "Ctrl+");
}
