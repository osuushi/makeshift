import type { ToolResult } from "./catalog.js";
import { unavailableHelp } from "./navigator-availability.js";
import { drawerTitle } from "./toolbox-defaults.js";
import { toolboxIcon } from "./toolbox-icons.js";
import { type ToolboxItem, type ToolboxPath, toolboxLeaf } from "./toolbox-tree.js";
export type ToolboxTool = Pick<ToolResult, "id" | "label" | "description" | "unavailable">;

export function toolboxRow(
  item: ToolboxItem,
  path: ToolboxPath,
  tools: Map<string, ToolboxTool>,
  activate: (event: MouseEvent) => void,
  expand: () => void,
): HTMLElement {
  const id = toolboxLeaf(item),
    tool = tools.get(id),
    group = typeof item !== "string",
    title = group ? item.title : undefined,
    label = title ?? tool?.label ?? id;
  const row = document.createElement("div");
  row.className = "toolbox-row";
  row.dataset.toolboxPath = JSON.stringify(path);
  if (id === "select" || id === "transform") row.dataset.toolboxFixed = "true";
  row.dataset.label = label;
  if (title) row.dataset.menu = title;
  if (title === drawerTitle) row.dataset.toolboxAnchored = "true";
  if (group) row.dataset.group = "true";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "toolbox-item";
  if (!title) button.dataset.tool = id;
  else button.setAttribute("aria-haspopup", "menu");
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-disabled", String(!title && (!tool || !!tool.unavailable)));
  button.title = title
    ? `Open ${title}`
    : tool?.unavailable
      ? unavailableHelp(tool.unavailable)
      : (tool?.description ?? tool?.label ?? id);
  const name = document.createElement("span");
  name.textContent = label;
  button.append(toolboxIcon(title ? "toolbox-menu" : id), name);
  button.onclick = title ? expand : activate;
  row.append(button);
  if (group) {
    const arrow = document.createElement("button");
    arrow.type = "button";
    arrow.className = "toolbox-expand";
    arrow.textContent = "›";
    arrow.setAttribute("aria-label", title ? `Open ${title}` : `Alternatives for ${label}`);
    arrow.setAttribute("aria-haspopup", "menu");
    arrow.onclick = expand;
    row.append(arrow);
  }
  return row;
}
