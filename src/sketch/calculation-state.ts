import type { ModelRequest } from "./model-api.js";

/** Calculation can be discarded before acceptance; an explicit Accept completes normally. */
export function cancellableCalculation(kind: ModelRequest["kind"]): boolean {
  return [
    "begin-profile-edit",
    "preview",
    "complete-preview",
    "mirror",
    "scale",
    "plane-cut",
    "check-plane-cut",
    "extrude",
    "loft",
    "revolve",
    "offset-faces",
    "shell",
    "erode",
    "import-step",
    "reconstruct-mesh",
    "move-faces",
    "move-edges",
    "finish-edges",
    "edge-finish-selection",
    "boolean-bodies",
    "project",
    "offset-sketch",
    "cleanup",
    "check-cleanup",
    "delete-topology",
    "delete-entities",
    "smart-object",
    "transform-bodies",
    "open",
  ].includes(kind);
}

export function calculationLabel(kind: ModelRequest["kind"] | undefined): string {
  switch (kind) {
    case "delete-topology":
      return "Deleting faces and edges";
    case "delete-entities":
      return "Deleting geometry";
    case "smart-object":
      return "Editing smart objects";
    case "shell":
      return "Calculating shell";
    case "import-step":
      return "Importing STEP";
    case "reconstruct-mesh":
      return "Reconstructing mesh";
    case "erode":
      return "Calculating erosion";
    case "open":
      return "Opening document";
    case "preview":
    case "edit":
      return "Solving sketch";
    case "accept":
      return "Completing edit";
    case "begin-profile-edit":
      return "Recovering revolved profile";
    case "apply-profile-edit":
      return "Applying profile edit";
    default:
      return "Calculating geometry";
  }
}
