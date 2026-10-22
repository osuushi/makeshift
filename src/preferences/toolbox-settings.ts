import type { SketchEditor } from "../sketch/editor.js";
import { type ToolResult, toolCatalog } from "../tools/catalog.js";
import { ToolboxDrag } from "../tools/toolbox-drag.js";
import { toolboxRow } from "../tools/toolbox-row.js";
import {
  moveToolboxItem,
  selectToolboxPath,
  type ToolboxGroup,
  type ToolboxPath,
} from "../tools/toolbox-tree.js";
import { onToolboxChange, resetToolbox, setToolboxTree, toolboxTree } from "./toolbox.js";

/** The complete editable tree, sharing ownership/move rules with the compact toolbox. */
export function installToolboxSettings(
  dialog: HTMLDialogElement,
  editor: SketchEditor,
): () => void {
  const panel = toolboxSettingsTab(dialog);
  const hint = document.createElement("p");
  hint.textContent =
    "Drag to reorder. Drop onto a tool to group them. Drop between rows to place a tool. Select a row to choose the tool shown for that group.";
  const tree = document.createElement("div");
  tree.className = "toolbox-settings-tree";
  const reset = document.createElement("button");
  reset.type = "button";
  reset.textContent = "Reset toolbox to defaults";
  reset.onclick = resetToolbox;
  panel.append(hint, reset, tree);
  const drag = new ToolboxDrag(tree, (from, target) =>
    setToolboxTree(moveToolboxItem(toolboxTree(), from, target.path, target.mode)),
  );
  const render = () => {
    if (drag.dragging) return;
    const tools = new Map(
      toolCatalog(editor)
        .results()
        .map((tool) => [tool.id, tool]),
    );
    tree.replaceChildren();
    renderTree(toolboxTree(), [], tree, tools);
    const outside = document.createElement("div");
    outside.className = "toolbox-root-drop";
    outside.textContent = "Drop here to add a top-level tool";
    outside.dataset.toolboxPath = "[]";
    outside.dataset.rootDrop = "true";
    tree.append(outside);
  };
  const dispose = onToolboxChange(render);
  dialog.addEventListener("beforetoggle", render);
  render();
  return () => {
    dispose();
    drag.dispose();
    dialog.removeEventListener("beforetoggle", render);
  };
}

function renderTree(
  group: ToolboxGroup,
  path: ToolboxPath,
  host: HTMLElement,
  tools: Map<string, ToolResult>,
): void {
  group.items.forEach((item, index) => {
    const childPath = [...path, index];
    const row = toolboxRow(
      item,
      childPath,
      tools,
      () => setToolboxTree(selectToolboxPath(toolboxTree(), childPath)),
      () => {},
    );
    row.querySelector(".toolbox-expand")?.remove();
    row.querySelector(".toolbox-item")?.setAttribute("aria-disabled", "false");
    row
      .querySelector(".toolbox-item")
      ?.setAttribute("aria-pressed", String(group.selected === index));
    if (typeof item !== "string") {
      const count = document.createElement("small");
      count.textContent = `${item.items.length} alternatives`;
      row.append(count);
    }
    host.append(row);
    if (typeof item !== "string") {
      const children = document.createElement("div");
      children.className = "toolbox-tree-children";
      host.append(children);
      renderTree(item, childPath, children, tools);
    }
  });
}

function toolboxSettingsTab(dialog: HTMLDialogElement): HTMLElement {
  const form = dialog.querySelector("form");
  const actions = dialog.querySelector(".settings-actions");
  if (!form || !actions) throw new Error("Missing settings form");
  const general = document.createElement("section");
  general.id = "settings-general";
  for (const child of [...form.children])
    if (child.tagName !== "H2" && child !== actions) general.append(child);
  const panel = document.createElement("section");
  panel.id = "settings-toolbox";
  panel.hidden = true;
  const tabs = document.createElement("div");
  tabs.className = "settings-tabs";
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "Settings sections");
  for (const [label, content] of [
    ["General", general],
    ["Toolbox", panel],
  ] as const) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.textContent = label;
    tab.id = `${content.id}-tab`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", content.id);
    content.setAttribute("role", "tabpanel");
    content.setAttribute("aria-labelledby", tab.id);
    const choose = () => {
      for (const section of [general, panel]) section.hidden = section !== content;
      for (const button of tabs.querySelectorAll<HTMLButtonElement>("button")) {
        button.setAttribute("aria-selected", String(button === tab));
        button.tabIndex = button === tab ? 0 : -1;
      }
      const scaleReset = dialog.querySelector<HTMLElement>("[data-reset]");
      if (scaleReset) scaleReset.hidden = content !== general;
    };
    tab.onclick = choose;
    tab.onkeydown = (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      const other = [...tabs.querySelectorAll("button")].find((b) => b !== tab);
      other?.click();
      other?.focus();
    };
    tabs.append(tab);
    if (content === general) choose();
    else {
      tab.tabIndex = -1;
      tab.setAttribute("aria-selected", "false");
    }
  }
  actions.before(tabs, general, panel);
  return panel;
}
