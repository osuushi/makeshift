/** Fixed slots are part of the learned gesture. Aliases reference the same command ID. */
export interface NavigatorGroup {
  label: string;
  entries: readonly string[];
}
export const navigatorGroups: Record<string, NavigatorGroup> = {
  root: {
    label: "Browse tools",
    entries: [
      "draw",
      "create",
      "combine",
      "shape",
      "move-copy",
      "constrain",
      "references",
      "organize",
      "utilities",
    ],
  },
  draw: {
    label: "Draw & sketch",
    entries: [
      "line",
      "rectangle",
      "circle",
      "bezier",
      "pen",
      "trim",
      "sketch-entry",
      "edit-curves",
      "reuse",
    ],
  },
  create: {
    label: "Create solids",
    entries: [
      "cube",
      "cylinder",
      "sphere",
      "cone",
      "extrude",
      "revolve",
      "loft",
      "import-mesh",
      "duplicate",
    ],
  },
  combine: {
    label: "Combine & cut",
    entries: [
      "union",
      "subtract",
      "intersect",
      "split",
      "imprint",
      "drill",
      "trim",
      "shell",
      "erode",
    ],
  },
  shape: {
    label: "Shape & finish",
    entries: [
      "offset",
      "shell",
      "erode",
      "fillet",
      "chamfer",
      "extrude",
      "cleanup",
      "surface-details",
      "reopen-operation",
    ],
  },
  "move-copy": {
    label: "Move & copy",
    entries: ["transform", "duplicate", "mirror", "offset", "sketch-offset"],
  },
  constrain: { label: "Constrain", entries: ["direction", "connect", "match", "locks"] },
  references: {
    label: "Planes & references",
    entries: [
      "construction-plane",
      "project",
      "use-edge",
      "sketch-on-face",
      "principal-planes",
      "new-sketch-on-plane",
      "tag-geometry",
      "cross-section",
    ],
  },
  organize: {
    label: "Select & organize",
    entries: [
      "select",
      "select-face",
      "selection-clear",
      "select-visible",
      "refine-selection",
      "tag-geometry",
      "isolate",
      "end-isolation",
    ],
  },
  utilities: {
    label: "View & utilities",
    entries: [
      "cross-section",
      "visibility",
      "sketch-grid",
      "grid",
      "modeling",
      "settings",
      "exchange",
      "edit-cleanup",
      "diagnostics",
    ],
  },
  "sketch-entry": {
    label: "Start or edit sketch",
    entries: [
      "start-sketch",
      "edit-sketch",
      "sketch-on-face",
      "new-sketch-on-plane",
      "sketch-xy",
      "sketch-xz",
      "sketch-yz",
    ],
  },
  "edit-curves": {
    label: "Edit curves",
    entries: ["sketch-offset", "sketch-fillet", "clear-sketch"],
  },
  reuse: { label: "Reuse geometry", entries: ["project", "use-edge"] },
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
  match: { label: "Match geometry", entries: ["constraint-equal", "constraint-concentric"] },
  locks: {
    label: "Lock dimensions",
    entries: ["lock-width", "lock-height", "lock-length", "lock-radius", "lock-cornerAngle"],
  },
  "principal-planes": {
    label: "Principal planes",
    entries: ["sketch-xy", "sketch-xz", "sketch-yz"],
  },
  "select-visible": {
    label: "Select visible",
    entries: ["select-all-bodies", "select-all-sketches"],
  },
  "refine-selection": {
    label: "Refine selection",
    entries: [
      "selection-remove-edges",
      "selection-remove-faces",
      "selection-only-edges",
      "selection-only-faces",
      "selection-add-faces",
      "selection-add-edges",
      "selection-bodies",
      "selection-boundary",
    ],
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
  diagnostics: { label: "Diagnostics", entries: ["capture"] },
};

/** First examples stay deterministic, even when unavailable. */
export function navigatorExamples(group: string): string[] {
  return navigatorGroups[group].entries
    .flatMap((id) => (navigatorGroups[id] ? navigatorExamples(id) : [id]))
    .slice(0, 3);
}
