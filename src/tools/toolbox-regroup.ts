import { drawerTitle, toolboxMenu } from "./toolbox-defaults.js";
import { normalizeToolbox } from "./toolbox-layout.js";
import {
  toolboxGroup as group,
  type ToolboxGroup,
  type ToolboxItem,
  toolboxLeaf,
  toolboxLeaves,
} from "./toolbox-tree.js";

/** Upgrade the authored solid families while preserving unrelated custom groups and choices. */
export function regroupToolbox(root: ToolboxGroup): ToolboxGroup {
  const primitives = ["cube", "cylinder", "sphere", "cone", "drill"];
  const sweeps = ["extrude", "revolve", "loft"];
  const moved = new Set([...primitives, ...sweeps, "transform", "duplicate", "mirror"]);
  const representatives = root.items
    .filter((item) => typeof item === "string" || !item.title)
    .map(toolboxLeaf);
  const family = (ids: string[]): ToolboxGroup => ({
    items: ids,
    selected: Math.max(0, ids.indexOf(representatives.find((id) => ids.includes(id)) ?? "")),
  });
  const prune = (item: ToolboxItem): ToolboxItem | null => {
    if (typeof item === "string") return moved.has(item) ? null : item;
    const selected = toolboxLeaf(item);
    const items = item.items.flatMap((child) => {
      const kept = prune(child);
      return kept === null ? [] : [kept];
    });
    if (item.title) return toolboxMenu(item.title, ...items);
    if (items.length === 0) return null;
    if (items.length === 1) return items[0];
    return {
      items,
      selected: Math.max(
        0,
        items.findIndex((child) => toolboxLeaf(child) === selected),
      ),
    };
  };
  const items: ToolboxItem[] = [];
  let placed = false;
  let drawer: ToolboxGroup | undefined;
  for (const item of root.items) {
    const isDrawer = typeof item !== "string" && item.title === drawerTitle;
    if (
      !placed &&
      (isDrawer || toolboxLeaves(item).some((id) => primitives.includes(id) || sweeps.includes(id)))
    ) {
      items.push(family(primitives), family(sweeps));
      placed = true;
    }
    const kept = prune(item);
    if (kept !== null) items.push(kept);
    if (isDrawer && typeof kept === "object" && kept) drawer = kept;
  }
  if (!placed) items.push(family(primitives), family(sweeps));
  if (!drawer) {
    drawer = toolboxMenu(drawerTitle);
    items.push(drawer);
  }
  drawer.items.push("mirror");
  return normalizeToolbox(group(...items));
}
