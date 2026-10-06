import { numericConstraints, numericValue } from "./constraint-geometry.js";
import { type NumericConstraint, newId, type Sketch } from "./document.js";
import type { Quantity } from "./drag-state.js";
import type { SketchEditor } from "./editor.js";

export function dimensionLockTarget(
  editor: SketchEditor,
  quantity: Quantity,
): { curve: string; kind: NumericConstraint["kind"] } | null {
  if ((quantity === "width" || quantity === "height") && editor.rectangleContext)
    return { curve: editor.rectangleContext.members[quantity === "width" ? 0 : 1], kind: "length" };
  if (quantity === "length" && editor.line) return { curve: editor.line.id, kind: "length" };
  const curve = editor.circle ?? editor.arc;
  if (quantity === "radius" && curve) return { curve: curve.id, kind: "radius" };
  return null;
}
export function dimensionLock(
  editor: SketchEditor,
  quantity: Quantity,
): NumericConstraint | undefined {
  const target = dimensionLockTarget(editor, quantity);
  return target && editor.sketch
    ? numericConstraints(editor.sketch).find(
        (c) => c.curve === target.curve && c.kind === target.kind,
      )
    : undefined;
}
export function updateDimensionLock(
  editor: SketchEditor,
  quantity: Quantity,
  sketch: Sketch,
): Sketch {
  const existing = dimensionLock(editor, quantity);
  if (!existing) return sketch;
  const curve = sketch.curves.find((c) => c.id === existing.curve);
  if (!curve) throw new Error("Locked curve no longer exists");
  return {
    ...sketch,
    constraints: sketch.constraints.map((c) =>
      c.id === existing.id ? { ...existing, value: numericValue(curve, existing.kind) } : c,
    ),
  };
}
export async function toggleDimensionLock(editor: SketchEditor, quantity: Quantity): Promise<void> {
  if (editor.blocked || editor.isDragging) return;
  await editor.numeric.commit();
  if (editor.interactions.current?.kind === "numeric") return;
  const sketch = editor.sketch,
    target = dimensionLockTarget(editor, quantity);
  if (!sketch || !target) return;
  const curve = sketch.curves.find((c) => c.id === target.curve);
  if (!curve) return;
  const existing = dimensionLock(editor, quantity);
  const constraints = existing
    ? sketch.constraints.filter((c) => c.id !== existing.id)
    : [...sketch.constraints, { id: newId(), ...target, value: numericValue(curve, target.kind) }];
  await editor.editSketch({ ...sketch, constraints });
  editor.refresh();
}
