import { guideSnap } from "../guides/snapping.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { Vector } from "../sketch/planes.js";

/** The cursor acquires the guide; only its component along the arrow moves the anchor. */
export function axisGuideSnap(
  editor: SketchEditor,
  origin: Vector,
  direction: Vector,
  clientX: number,
  clientY: number,
): number | null {
  const bounds = editor.world.canvas.getBoundingClientRect();
  const { point } = guideSnap(editor, { x: clientX - bounds.x, y: clientY - bounds.y });
  if (!point) return null;
  return point.reduce(
    (amount, coordinate, i) => amount + (coordinate - origin[i]) * direction[i],
    0,
  );
}
