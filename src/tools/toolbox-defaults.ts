import { toolboxGroup as group, type ToolboxGroup, toolboxLeaves } from "./toolbox-tree.js";

export const drawerTitle = "Other Tools";
export const transformTools = ["move", "rotate", "scale", "transform"] as const;
export const transformToolGroup = (): ToolboxGroup => group(...transformTools);
export function toolboxMenu(title: string, ...items: (string | ToolboxGroup)[]): ToolboxGroup {
  return { ...group(...items), title };
}

/** Standalone Select, flat remembered alternatives, then a stable named drawer. */
export function defaultToolbox(): ToolboxGroup {
  return group(
    "select",
    transformToolGroup(),
    group("line", "rectangle", "circle", "pen", "trim"),
    group("cube", "cylinder", "sphere", "cone", "drill"),
    group("extrude", "revolve", "loft"),
    group("union", "subtract", "intersect", "split", "imprint"),
    group("fillet", "chamfer", "shell", "offset"),
    toolboxMenu(
      drawerTitle,
      toolboxMenu("Sketch editing", "bezier", "sketch-offset", "sketch-fillet"),
      toolboxMenu("Surface details", "erode", "threads", "gear", "knurling"),
      toolboxMenu(
        "Planes & references",
        "construction-plane",
        "project",
        "use-edge",
        "cross-section",
      ),
      "mirror",
    ),
  );
}

export const toolboxTools = new Set(toolboxLeaves(defaultToolbox()));
export function toolboxMenuTitle(item: ToolboxGroup): string {
  const leaves = toolboxLeaves(item);
  const drawer = defaultToolbox().items.at(-1) as ToolboxGroup;
  const match = drawer.items.find(
    (menu) => typeof menu !== "string" && toolboxLeaves(menu).some((id) => leaves.includes(id)),
  );
  if (typeof match === "object") return match.title ?? "Tools";
  for (const [title, ids] of [
    ["Transform", transformTools],
    ["Drawing", ["line", "rectangle", "circle", "pen", "trim"]],
    ["Primitives", ["cube", "cylinder", "sphere", "cone", "drill"]],
    ["Extrude & revolve", ["extrude", "revolve", "loft"]],
    ["Booleans", ["union", "subtract", "intersect", "split", "imprint"]],
    ["Shape editing", ["fillet", "chamfer", "shell", "offset"]],
  ] as const) {
    if (ids.some((id) => leaves.includes(id))) return title;
  }
  return "Tools";
}
