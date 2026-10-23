import type { SketchEditor } from "../sketch/editor.js";
import type { Vector } from "../sketch/planes.js";
import { scaleSelection } from "./scale-selection.js";
import {
  boxHandles,
  boxLocal,
  boxWorld,
  selectionBox,
  type TransformBox,
} from "./transform-box.js";
import { outsideBoxRatio, projectedHull } from "./transform-box-layout.js";
import { transformLayerEnabled } from "./transform-layers.js";

const displayedBoxes = new WeakMap<
  SketchEditor,
  { box: TransformBox; pivot: Vector; factors: Vector }
>();
const boxChanged = new WeakMap<SketchEditor, Set<() => void>>();

/** Repaint dependent controls after scale has positioned its current preview. */
export function observeTransformBox(editor: SketchEditor, changed: () => void): () => void {
  let listeners = boxChanged.get(editor);
  if (!listeners) {
    listeners = new Set();
    boxChanged.set(editor, listeners);
  }
  listeners.add(changed);
  return () => listeners.delete(changed);
}

export function repaintTransformControls(editor: SketchEditor): void {
  for (const changed of boxChanged.get(editor) ?? []) changed();
}

export function displayedTransformBox(
  editor: SketchEditor,
  box: TransformBox | null,
  pivot: Vector = [0, 0, 0],
  factors: Vector = [1, 1, 1],
): void {
  if (box) displayedBoxes.set(editor, { box, pivot, factors });
  else displayedBoxes.delete(editor);
  repaintTransformControls(editor);
}

/** Keep translation and rotation controls outside the visible scale box. */
export function clearTransformArrow(
  editor: SketchEditor,
  pivot: Vector,
  tip: Vector,
  radius = 32,
): Vector {
  const origin = editor.world.project(pivot),
    end = editor.world.project(tip);
  const ratio = clearTransformControl(
    editor,
    pivot,
    { x: end.x - origin.x, y: end.y - origin.y },
    radius,
  );
  return tip.map((value, axis) => pivot[axis] + (value - pivot[axis]) * ratio) as Vector;
}

export function clearTransformControl(
  editor: SketchEditor,
  pivot: Vector,
  tip: { x: number; y: number },
  radius = 32,
): number {
  if (!transformLayerEnabled(editor, "scale")) return 1;
  const displayed = displayedBoxes.get(editor);
  const source = scaleSelection(editor);
  const box = displayed?.box ?? (source && selectionBox(editor, source));
  if (!box) return 1;
  const origin = editor.world.project(pivot);
  const local = displayed && boxLocal(box, displayed.pivot);
  const hull = projectedHull(
    boxHandles(box).map((h) => {
      const scaled =
        local && displayed
          ? (h.point.map(
              (value, axis) => local[axis] + (value - local[axis]) * displayed.factors[axis],
            ) as Vector)
          : h.point;
      const point = editor.world.project(boxWorld(box, scaled));
      return { x: point.x - origin.x, y: point.y - origin.y };
    }),
  );
  return outsideBoxRatio(tip, hull, radius);
}
