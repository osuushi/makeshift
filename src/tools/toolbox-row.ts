import type { ToolResult } from "./catalog.js";
import { unavailableHelp } from "./navigator-availability.js";
import { toolboxIcon } from "./toolbox-icons.js";
import { type ToolboxItem, type ToolboxPath, toolboxLeaf } from "./toolbox-tree.js";
export function toolboxRow(
  item: ToolboxItem,
  path: ToolboxPath,
  tools: Map<string, ToolResult>,
  activate: (event: MouseEvent) => void,
  expand: () => void,
): HTMLElement {
  const id = toolboxLeaf(item),
    tool = tools.get(id),
    group = typeof item !== "string";
  const row = document.createElement("div");
  row.className = "toolbox-row";
  row.dataset.toolboxPath = JSON.stringify(path);
  row.dataset.label = tool?.label ?? id;
  if (group) row.dataset.group = "true";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "toolbox-item";
  button.dataset.tool = id;
  button.setAttribute("aria-label", tool?.label ?? id);
  button.setAttribute("aria-disabled", String(!tool || !!tool.unavailable));
  button.title = tool?.unavailable
    ? unavailableHelp(tool.unavailable)
    : (tool?.description ?? tool?.label ?? id);
  const name = document.createElement("span");
  name.textContent = tool?.label ?? id;
  button.append(toolboxIcon(id), name);
  button.onclick = activate;
  row.append(button);
  if (group) {
    const arrow = document.createElement("button");
    arrow.type = "button";
    arrow.className = "toolbox-expand";
    arrow.textContent = "›";
    arrow.setAttribute("aria-label", `Alternatives for ${tool?.label ?? id}`);
    arrow.setAttribute("aria-haspopup", "menu");
    arrow.onclick = expand;
    row.append(arrow);
  }
  return row;
}
