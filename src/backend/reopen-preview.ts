import type { ModelView } from "../sketch/model-api.js";

/** Accepted preview measurements travel with the existing history snapshot. */
export type ReopenPreview = Pick<
  ModelView,
  | "cutEdges"
  | "edgeSize"
  | "edgeSelection"
  | "offsetDistance"
  | "offsetSelection"
  | "booleanMode"
  | "booleanTargets"
  | "erosionQuality"
  | "cleanupAvailable"
>;
export function reopenPreview(view: ModelView): ReopenPreview {
  return structuredClone({
    cutEdges: view.cutEdges,
    edgeSize: view.edgeSize,
    edgeSelection: view.edgeSelection,
    offsetDistance: view.offsetDistance,
    offsetSelection: view.offsetSelection,
    booleanMode: view.booleanMode,
    booleanTargets: view.booleanTargets,
    erosionQuality: view.erosionQuality,
    cleanupAvailable: view.cleanupAvailable,
  });
}
