import { drawerTitle, toolboxMenu, toolboxMenuTitle, toolboxTools } from "./toolbox-defaults.js";
import {
  toolboxGroup as group,
  moveToolboxItem,
  type ToolboxDrop,
  type ToolboxGroup,
  type ToolboxItem,
  type ToolboxPath,
  toolboxItem,
  toolboxLeaf,
  toolboxLeaves,
} from "./toolbox-tree.js";

/** Only the drawer contains named nested menus; ordinary alternatives are one layer. */
export function normalizeToolbox(root: ToolboxGroup): ToolboxGroup {
  const seen = new Set(["select"]);
  const keep = (id: string) => {
    if (seen.has(id) || !toolboxTools.has(id)) return false;
    seen.add(id);
    return true;
  };
  const menu = (item: ToolboxItem): ToolboxItem | null => {
    if (typeof item === "string") return keep(item) ? item : null;
    const items = item.items.flatMap((child) => {
      const value = menu(child);
      return value === null ? [] : [value];
    });
    return toolboxMenu(item.title ?? toolboxMenuTitle(item), ...items);
  };
  const items: ToolboxItem[] = ["select"];
  let drawer: ToolboxGroup | undefined;
  for (const item of root.items) {
    if (typeof item === "string") {
      if (keep(item)) items.push(item);
    } else if (item.title === drawerTitle) {
      const value = menu(item) as ToolboxGroup;
      if (drawer) drawer.items.push(...value.items);
      else {
        drawer = value;
        items.push(drawer);
      }
    } else {
      const selected = toolboxLeaves(item).length ? toolboxLeaf(item) : undefined;
      const leaves = toolboxLeaves(item).filter(keep);
      if (leaves.length === 1) items.push(leaves[0]);
      else if (leaves.length)
        items.push({ items: leaves, selected: Math.max(0, leaves.indexOf(selected ?? "")) });
    }
  }
  if (!drawer) items.push(toolboxMenu(drawerTitle));
  return group(...items);
}

/** Prevent nesting in swapping groups and keep Select and the drawer at the root. */
export function moveToolbox(
  root: ToolboxGroup,
  from: ToolboxPath,
  to: ToolboxPath,
  drop: ToolboxDrop,
): ToolboxGroup {
  const source = toolboxItem(root, from),
    target = toolboxItem(root, to);
  if (source === "select" || (typeof source === "object" && source.title === drawerTitle))
    return root;
  if (target === "select") return root;
  // Within an existing group, a center drop orders siblings instead of nesting them.
  if (to.length > 1 && typeof target === "string" && drop === "inside") drop = "after";
  return normalizeToolbox(moveToolboxItem(root, from, to, drop));
}
