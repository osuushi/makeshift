import { toolboxGroup as group, type ToolboxGroup, toolboxLeaves } from "./toolbox-tree.js";

/** Select is fixed; the five unnamed groups contain ongoing tools, not commands. */
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
    group(
      "fillet",
      "chamfer",
      "shell",
      "offset",
      "erode",
      group("union", "subtract", "intersect", "split", "imprint", "drill"),
      group("threads", "gear", "knurling"),
    ),
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
