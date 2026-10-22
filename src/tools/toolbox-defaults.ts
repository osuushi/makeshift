import { toolboxGroup as group, type ToolboxGroup } from "./toolbox-tree.js";

/** Unnamed, owned groups. Default representatives are the first tool in each group. */
export function defaultToolbox(): ToolboxGroup {
  return group(
    group(
      "select",
      "select-face",
      "selection-clear",
      group("select-all-bodies", "select-all-sketches", "tag-geometry"),
      group(
        "selection-only-edges",
        "selection-only-faces",
        "selection-remove-edges",
        "selection-remove-faces",
        "selection-add-faces",
        "selection-add-edges",
        "selection-bodies",
        "selection-boundary",
      ),
    ),
    group(
      "start-sketch",
      "edit-sketch",
      "sketch-on-face",
      "new-sketch-on-plane",
      group("sketch-xy", "sketch-xz", "sketch-yz"),
    ),
    group("line", "rectangle", "circle", "bezier", "pen"),
    group("trim", "sketch-offset", "sketch-fillet", "clear-sketch"),
    group("cube", "cylinder", "sphere", "cone", "import-mesh"),
    group("extrude", "revolve", "loft", "offset"),
    group("union", "subtract", "intersect", group("split", "imprint", "drill")),
    group("fillet", "chamfer", "shell", "erode", "cleanup", "reopen-operation"),
    group("transform", "duplicate", "mirror"),
    group("construction-plane", "project", "use-edge"),
    group("threads", "gear", "knurling", "decorator-library"),
    group(
      "cross-section",
      "sketch-grid",
      "grid",
      "modeling",
      group("show-bodies", "hide-bodies", "isolate", "end-isolation"),
    ),
    group("export-step", "export-stl", "export-3mf", "cancel-export", "capture"),
  );
}
