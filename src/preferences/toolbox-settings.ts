import { ToolboxDrag } from "../tools/toolbox-drag.js";
import { moveToolbox } from "../tools/toolbox-layout.js";
import { type ToolboxTool, toolboxRow } from "../tools/toolbox-row.js";
import { selectToolboxPath, type ToolboxGroup, type ToolboxPath } from "../tools/toolbox-tree.js";
import { onToolboxChange, resetToolbox, setToolboxTree, toolboxTree } from "./toolbox.js";

/** The complete editable tree, sharing ownership/move rules with the compact toolbox. */
export function installToolboxSettings(
  panel: HTMLElement,
  readTools: () => readonly ToolboxTool[],
): () => void {
  const dialog = panel.closest("dialog");
  const hint = document.createElement("p");
  hint.textContent =
    "Drag tools between the toolbox and Other Tools. Drop one top-level tool onto another to group them. Regular groups have one layer and remember your choice; named menus in Other Tools keep their titles.";
  const tree = document.createElement("div");
  tree.className = "toolbox-settings-tree";
  const reset = document.createElement("button");
  reset.type = "button";
  reset.textContent = "Reset toolbox to defaults";
  reset.onclick = resetToolbox;
  panel.append(hint, reset, tree);
  const drag = new ToolboxDrag(tree, (from, target) =>
    setToolboxTree(moveToolbox(toolboxTree(), from, target.path, target.mode)),
  );
  const render = () => {
    if (drag.dragging) return;
    const tools = new Map(readTools().map((tool) => [tool.id, tool]));
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
  dialog?.addEventListener("beforetoggle", render);
  panel.addEventListener("toolbox-refresh", render);
  render();
  return () => {
    panel.removeEventListener("toolbox-refresh", render);
    dispose();
    drag.dispose();
    dialog?.removeEventListener("beforetoggle", render);
  };
}

function renderTree(
  group: ToolboxGroup,
  path: ToolboxPath,
  host: HTMLElement,
  tools: Map<string, ToolboxTool>,
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
      ?.setAttribute(
        "aria-pressed",
        String(path.length === 1 && !group.title && group.selected === index),
      );
    if (typeof item !== "string") {
      const count = document.createElement("small");
      count.textContent = `${item.items.length} ${item.title ? "items" : "alternatives"}`;
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
