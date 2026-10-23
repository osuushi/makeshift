import type { SketchEditor } from "../sketch/editor.js";
import type { Vector } from "../sketch/planes.js";
import { scalePivot, scaleSelection } from "./scale-selection.js";
import type { ScaleWidget } from "./scale-widget.js";
import { selectionBox, type TransformBox } from "./transform-box.js";
import { transformLayerEnabled } from "./transform-layers.js";

type ScaleBoxTarget = { box: TransformBox; pivot: Vector; factors: Vector };

/** Planar movement requires Move and a visible Scale box, using the current preview frame. */
export function installScaleBoxTarget(
  editor: SketchEditor,
  widget: ScaleWidget,
  current: () => ScaleBoxTarget | null,
): void {
  editor.world.transformBoxContains = (x, y) => {
    if (!transformLayerEnabled(editor, "scale") || !transformLayerEnabled(editor, "move"))
      return false;
    const active = current();
    if (!active && !editor.transformAnchor?.active) return false;
    const source = active ? null : scaleSelection(editor);
    const box = active?.box ?? (source ? selectionBox(editor, source) : null);
    return (
      !!box &&
      widget.contains(
        editor,
        box,
        active?.pivot ?? editor.transformAnchor?.point ?? scalePivot(editor),
        active?.factors ?? [1, 1, 1],
        x,
        y,
      )
    );
  };
}
