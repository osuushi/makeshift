import { defaultToolbox, drawerTitle, toolboxMenu } from "./toolbox-defaults.js";
import { normalizeToolbox } from "./toolbox-layout.js";
import {
  findToolboxPath,
  toolboxGroup as group,
  moveToolboxItem,
  type ToolboxGroup,
  type ToolboxItem,
  toolboxItem,
  toolboxLeaf,
  toolboxLeaves,
} from "./toolbox-tree.js";

/** Older nested alternatives become flat groups; infrequent grouped tools go in named menus. */
export function migrateToolbox(root: ToolboxGroup): ToolboxGroup {
  const path = findToolboxPath(root, "union")?.slice(0, -1);
  const booleans = path && toolboxItem(root, path);
  const ids = ["union", "subtract", "intersect", "split", "imprint", "drill"];
  if (
    path &&
    path.length > 1 &&
    typeof booleans === "object" &&
    booleans.items.length === ids.length &&
    booleans.items.every((item) => typeof item === "string" && ids.includes(item))
  ) {
    root = moveToolboxItem(root, path, [path[0]], "before");
  }
  const defaults = defaultToolbox().items.at(-1) as ToolboxGroup;
  const rare = new Set(toolboxLeaves(defaults));
  const moved = new Set<string>();
  const items: ToolboxItem[] = [];
  for (const item of root.items) {
    if (typeof item === "string") items.push(item);
    else {
      const selected = toolboxLeaf(item);
      const leaves = toolboxLeaves(item).filter((id) => {
        if (!rare.has(id)) return true;
        moved.add(id);
        return false;
      });
      if (leaves.length)
        items.push({ items: leaves, selected: Math.max(0, leaves.indexOf(selected)) });
    }
  }
  const menus = defaults.items.flatMap((item) => {
    if (typeof item === "string") return [];
    const leaves = toolboxLeaves(item).filter((id) => moved.has(id));
    return leaves.length ? [toolboxMenu(item.title ?? "Tools", ...leaves)] : [];
  });
  return normalizeToolbox(group(...items, toolboxMenu(drawerTitle, ...menus)));
}
