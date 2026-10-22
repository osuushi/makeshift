import {
  findToolboxPath,
  toolboxGroup as group,
  moveToolboxItem,
  type ToolboxGroup,
  toolboxItem,
  toolboxLeaves,
} from "./toolbox-tree.js";

/** Select is fixed; the six unnamed groups contain ongoing tools, not commands. */
export function defaultToolbox(): ToolboxGroup {
  return group(
    "select",
    group(
      "line",
      "rectangle",
      "circle",
      "bezier",
      "pen",
      group("trim", "sketch-offset", "sketch-fillet"),
    ),
    group("cube", "cylinder", "sphere", "cone", group("extrude", "revolve", "loft")),
    group("union", "subtract", "intersect", "split", "imprint", "drill"),
    group("fillet", "chamfer", "shell", "offset", "erode", group("threads", "gear", "knurling")),
    group("transform", "duplicate", "mirror"),
    group("construction-plane", "project", "use-edge", "cross-section"),
  );
}

const eligible = new Set(toolboxLeaves(defaultToolbox()));
/** Enforce the toolbox boundary even for saved/custom layouts. Search keeps all commands. */
export function normalizeToolbox(root: ToolboxGroup): ToolboxGroup {
  const prune = (item: ToolboxGroup | string): ToolboxGroup | string | null => {
    if (typeof item === "string") return item !== "select" && eligible.has(item) ? item : null;
    const selected = item.items[item.selected];
    const kept = item.items
      .map((child) => ({ before: child, after: prune(child) }))
      .filter((child) => child.after !== null);
    if (!kept.length) return null;
    if (kept.length === 1) return kept[0].after;
    return {
      items: kept.map((child) => child.after as ToolboxGroup | string),
      selected: Math.max(
        0,
        kept.findIndex((child) => child.before === selected),
      ),
    };
  };
  const items = root.items.flatMap((item) => {
    const kept = prune(item);
    return kept === null ? [] : [kept];
  });
  return group("select", ...items);
}

/** Lift the former Boolean subgroup while retaining customized tools and chosen alternatives. */
export function promoteBooleanGroup(root: ToolboxGroup): ToolboxGroup {
  const path = findToolboxPath(root, "union")?.slice(0, -1);
  if (!path || path.length < 2) return root;
  const item = toolboxItem(root, path);
  const ids = ["union", "subtract", "intersect", "split", "imprint", "drill"];
  if (
    !item ||
    typeof item === "string" ||
    item.items.length !== ids.length ||
    !item.items.every((child) => typeof child === "string" && ids.includes(child))
  )
    return root;
  return moveToolboxItem(root, path, [path[0]], "before");
}
