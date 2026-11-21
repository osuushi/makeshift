import type { SketchDocument } from "../sketch/document.js";
import type { ModelingTarget } from "../sketch/model-selection-state.js";
import { resolveOperation } from "./operation-selection.js";
import { selectionContext } from "./selection-context.js";

/** Interactive parameter gathering; immediate operations (e.g. Delete) are not tools. */
export type ModelingTool =
  | "extrude"
  | "offset"
  | "move"
  | "fillet"
  | "chamfer"
  | "loft"
  | "revolve"
  | "erode"
  | "shell";

/** Preference only: applicability belongs to operation resolution. Mixed kinds have no default. */
export function defaultModelingTool(
  targets: readonly ModelingTarget[],
  document: SketchDocument,
): ModelingTool | null {
  const c = selectionContext(targets, document);
  let preferred: ModelingTool | null = null;
  if (c.ordered.length && c.ordered.every((t) => t.kind === "profile")) preferred = "extrude";
  else if (
    c.ordered.length &&
    !c.partialFaces.length &&
    c.ordered.every((t) => "body" in t || t.kind === "smart-object") &&
    !c.edges.length
  )
    preferred = "move";
  else if (!c.complete.length && c.ordered.length && c.ordered.every((t) => t.kind === "face"))
    preferred = "offset";
  else if (c.ordered.length && c.ordered.every((t) => t.kind === "edge")) preferred = "fillet";
  return preferred && resolveOperation(preferred, targets, document).available ? preferred : null;
}
