/** Fixed slots support learned tap sequences. Aliases reference the same command ID. */
export interface NavigatorGroup {
  label: string;
  entries: readonly string[];
}
export const navigatorGroups: Record<string, NavigatorGroup> = {
  root: {
    label: "Browse tools",
    entries: ["draw", "create", "shape", "constrain", "organize", "utilities"],
  },
  draw: {
    label: "Draw & sketch",
    entries: ["sketch-entry", "edit-curves", "reuse", "curved-drawing", "line", "rectangle"],
  },
  create: {
    label: "Create solids",
    entries: ["primitive-solids", "extrude", "revolve", "loft", "import-mesh", "duplicate"],
  },
  combine: {
    label: "Combine & cut",
    entries: ["union", "subtract", "intersect", "split", "imprint", "drill"],
  },
  shape: {
    label: "Modify solids",
    entries: ["combine", "solid-finish", "surface-details", "move-copy", "offset", "extrude"],
  },
  "move-copy": {
    label: "Move & copy",
    entries: ["transform", "duplicate", "mirror", "offset", "sketch-offset"],
  },
  constrain: {
    label: "Constrain",
    entries: ["direction", "connect", "match", "locks"],
  },
  references: {
    label: "Planes & references",
    entries: [
      "principal-planes",
      "construction-plane",
      "project",
      "use-edge",
      "sketch-on-face",
      "new-sketch-on-plane",
    ],
  },
  organize: {
    label: "Select & organize",
    entries: [
      "select-visible",
      "refine-selection",
      "visibility",
      "select",
      "select-face",
      "selection-clear",
    ],
  },
  utilities: {
    label: "View & utilities",
    entries: ["references", "exchange", "edit-cleanup", "diagnostics", "view-controls", "settings"],
  },
  "sketch-entry": {
    label: "Start or edit sketch",
    entries: [
      "principal-planes",
      "start-sketch",
      "edit-sketch",
      "sketch-on-face",
      "new-sketch-on-plane",
    ],
  },
  "edit-curves": {
    label: "Edit curves",
    entries: ["trim", "sketch-offset", "sketch-fillet", "clear-sketch"],
  },
  reuse: {
    label: "Reuse geometry",
    entries: ["project", "use-edge"],
  },
  "surface-details": {
    label: "Surface details",
    entries: ["threads", "gear", "knurling", "decorator-library"],
  },
  direction: {
    label: "Direction",
    entries: ["constraint-horizontal", "constraint-vertical", "constraint-parallel"],
  },
  connect: {
    label: "Touch & connect",
    entries: [
      "points-coincident",
      "point-on-edge",
      "constraint-tangent",
      "point-tangent",
      "points-fuse",
      "points-unfuse",
    ],
  },
  match: {
    label: "Match geometry",
    entries: ["constraint-equal", "constraint-concentric"],
  },
  locks: {
    label: "Lock dimensions",
    entries: ["lock-width", "lock-height", "lock-length", "lock-radius", "lock-cornerAngle"],
  },
  "principal-planes": {
    label: "Principal planes",
    entries: ["sketch-xy", "sketch-xz", "sketch-yz"],
  },
  "select-visible": {
    label: "Select & tag",
    entries: ["select-all-bodies", "select-all-sketches", "tag-geometry"],
  },
  "refine-selection": {
    label: "Refine selection",
    entries: ["filter-selection", "expand-selection", "selection-bodies", "selection-boundary"],
  },
  visibility: {
    label: "Visibility",
    entries: ["show-bodies", "hide-bodies", "isolate", "end-isolation"],
  },
  exchange: {
    label: "Import & export",
    entries: ["import-mesh", "export-stl", "export-3mf", "export-step", "cancel-export"],
  },
  "edit-cleanup": {
    label: "Edit & cleanup",
    entries: ["reopen-operation", "clear-sketch", "cleanup"],
  },
  diagnostics: {
    label: "Diagnostics",
    entries: ["capture"],
  },
  "curved-drawing": {
    label: "Curves & freehand",
    entries: ["circle", "bezier", "pen"],
  },
  "primitive-solids": {
    label: "Primitive solids",
    entries: ["cube", "cylinder", "sphere", "cone"],
  },
  "solid-finish": {
    label: "Shape & finish",
    entries: ["shell", "erode", "fillet", "chamfer", "cleanup", "reopen-operation"],
  },
  "view-controls": {
    label: "View & grids",
    entries: ["cross-section", "sketch-grid", "grid", "modeling"],
  },
  "filter-selection": {
    label: "Filter selection",
    entries: [
      "selection-remove-edges",
      "selection-remove-faces",
      "selection-only-edges",
      "selection-only-faces",
    ],
  },
  "expand-selection": {
    label: "Extend selection",
    entries: ["selection-add-faces", "selection-add-edges"],
  },
};

/** First examples stay deterministic, even when unavailable. */
export function navigatorExamples(group: string): string[] {
  return navigatorGroups[group].entries.flatMap((id) =>
    navigatorGroups[id] ? navigatorExamples(id) : [id],
  );
}
