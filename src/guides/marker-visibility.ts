import type { SketchEditor } from "../sketch/editor.js";
import type { Vector } from "../sketch/planes.js";
import { guideVisibleThroughSolids } from "./solid-visibility.js";
import { guideOverlapsWidget } from "./widget-clearance.js";

/** Occlusion is immediate and independent of a marker's fade or minimum dwell. */
export function guideMarkerOccluded(
  editor: SketchEditor,
  point: Vector,
  bounds: readonly DOMRectReadOnly[],
  radius = 10,
): boolean {
  return (
    guideOverlapsWidget(editor.world.project(point), bounds, radius) ||
    !guideVisibleThroughSolids(editor, point)
  );
}
