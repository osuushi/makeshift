import type { InteractionLease } from "./active-interaction.js";
import { bowGuides, radiusEdit } from "./arc-edit.js";
import { arcAt, arcCircle } from "./arc-geometry.js";
import { circleRadius } from "./circle-edit.js";
import { appendSelection, copySelection } from "./copy-selection.js";
import { editCorner } from "./corner-angle.js";
import { selectedCorner } from "./corner-angle-controls.js";
import { circlePoint } from "./curve-geometry.js";
import { updateDimensionLock } from "./dimension-locks.js";
import { orientation, type Quantity } from "./drag-state.js";
import { rotatedPoint } from "./drag-update.js";
import type { SketchEditor } from "./editor.js";
import { expandedGroups, lineDimension, transformSelection } from "./line-edit.js";
import type { Point } from "./planes.js";
import { distance, midpoint } from "./point-math.js";
import { dimensionRectangle, rectangleFrame } from "./rectangle-edit.js";
import { selectionFrame } from "./selection-frame.js";
import { transformSelected } from "./selection-transform.js";
import { axisQuantity, transformHandles, translatedPoint } from "./transform-handles.js";

export interface DimensionValue {
  quantity: Quantity;
  label: string;
  unit: string;
  value: number;
  screen: Point;
}
export function dimensionValues(editor: SketchEditor): DimensionValue[] {
  if (editor.pointMenu) return [];
  const sketch = editor.sketch,
    group = editor.rectangleContext,
    line = editor.line,
    selection = selectionFrame(editor);
  if (!sketch || !selection) return [];
  const project = (point: Point) => editor.world.projectLocal(sketch.plane, point);
  const result: DimensionValue[] = [];
  result.push(...translationDimensions(editor));
  if (editor.moveMode) return [...result, ...rotationDimension(editor)];
  const bow = editor.arc ?? (editor.bowSide !== null ? line : undefined);
  if (bow) {
    const guide =
      bow.kind === "arc" ? bow : bowGuides(editor).find((g) => g.side === editor.bowSide)?.shape;
    if (guide?.kind === "arc") {
      const screen = project(arcAt(guide, 0.5));
      result.push({
        quantity: "radius",
        label: "Radius",
        unit: "mm",
        value: arcCircle(guide).radius,
        screen: { x: screen.x + 74, y: screen.y - 26 },
      });
    }
  }
  if (group) {
    const frame = rectangleFrame(sketch, group),
      center = project(frame.center);
    for (const quantity of ["width", "height"] as const) {
      const point =
        quantity === "width"
          ? midpoint(frame.corners[0], frame.corners[1])
          : midpoint(frame.corners[1], frame.corners[2]);
      const screen = project(point),
        dx = screen.x - center.x,
        dy = screen.y - center.y,
        length = Math.hypot(dx, dy) || 1;
      const clearance = 18 + Math.abs(dx / length) * 45 + Math.abs(dy / length) * 15;
      result.push({
        quantity,
        label: quantity === "width" ? "Width" : "Height",
        unit: "mm",
        value: frame[quantity],
        screen: {
          x: screen.x + (dx / length) * clearance,
          y: screen.y + (dy / length) * clearance,
        },
      });
    }
  } else if (line && !bow) {
    const a = project(line.a),
      b = project(line.b),
      center = midpoint(a, b),
      dx = b.x - a.x,
      dy = b.y - a.y,
      length = Math.hypot(dx, dy) || 1;
    const clearance = 18 + Math.abs(dy / length) * 60 + Math.abs(dx / length) * 16;
    result.push({
      quantity: "length",
      label: "Length",
      unit: "mm",
      value: distance(line.a, line.b),
      screen: { x: center.x - (dy / length) * clearance, y: center.y + (dx / length) * clearance },
    });
  }
  const circle = editor.circle;
  if (circle) {
    const edge = project(circlePoint(circle, editor.circleAngle));
    const center = project(circle.center),
      dx = edge.x - center.x,
      dy = edge.y - center.y;
    const length = Math.hypot(dx, dy) || 1;
    result.push({
      quantity: "radius",
      label: "Radius",
      unit: "mm",
      value: circle.radius,
      screen: { x: edge.x + (dx / length) * 70, y: edge.y + (dy / length) * 35 },
    });
    return result;
  }
  result.push(...cornerDimensions(editor));
  result.push(...rotationDimension(editor));
  return result;
}
export async function changeDimension(
  editor: SketchEditor,
  quantity: Quantity,
  value: number,
  interaction?: InteractionLease,
  duplicate = false,
): Promise<void> {
  if (
    !Number.isFinite(value) ||
    (!["angle", "cornerAngle", "translateX", "translateY"].includes(quantity) &&
      (value < 0 || (value === 0 && quantity !== "radius")))
  )
    throw new Error("Enter a valid dimension");
  if (editor.isDragging) {
    editor.numeric.duringDrag(quantity, value);
    return;
  }
  const sketch = editor.sketch,
    group = editor.rectangleContext,
    line = editor.line,
    selection = selectionFrame(editor);
  if (!sketch) return;
  if (quantity === "cornerAngle") {
    const corner = selectedCorner(editor);
    if (!corner) return;
    if (
      !(await editor.editSketch(
        editCorner(sketch, corner, value),
        { kind: "dimension" },
        interaction,
      ))
    )
      throw new Error(editor.message);
    return;
  }
  let changed = sketch;
  if (quantity === "translateX" || quantity === "translateY")
    changed = transformSelected(editor, sketch, (p) =>
      translatedPoint(p, quantity === "translateX" ? "x" : "y", value),
    );
  else if (editor.moveMode && quantity === "angle" && selection)
    changed = transformSelected(editor, sketch, (p) =>
      rotatedPoint(p, selection.pivot, value - orientation(editor)),
    );
  else if (group && (quantity === "width" || quantity === "height"))
    changed = dimensionRectangle(sketch, group, quantity, value, editor.activeHandle);
  else if (quantity === "radius" && (editor.arc || line)) {
    const curve = editor.arc ?? line;
    if (curve) changed = radiusEdit(sketch, curve, value, editor.bowSide ?? 1);
  } else if (editor.circle && quantity === "radius")
    changed = circleRadius(sketch, editor.circle.id, value);
  else if (line && (quantity === "length" || quantity === "angle"))
    changed = lineDimension(sketch, line.id, quantity, value);
  else if (quantity === "angle" && selection) {
    const delta = value - orientation(editor);
    changed = transformSelection(sketch, expandedGroups(sketch, editor.selectionOwners), (p) =>
      rotatedPoint(p, selection.pivot, delta),
    );
  }
  changed = updateDimensionLock(editor, quantity, changed);
  const copying = duplicate && ["translateX", "translateY", "angle"].includes(quantity);
  const copy = copying ? copySelection(changed, new Set(editor.selectionOwners)) : null;
  if (copy) changed = appendSelection(sketch, copy);
  if (!(await editor.editSketch(changed, { kind: "dimension" }, interaction)))
    throw new Error(editor.message);
  if (copy) editor.select(copy.curves.map((curve) => curve.id));
  if (quantity === "angle" && (!line || editor.moveMode)) {
    editor.selectionAngle = value;
    editor.refresh();
  }
}

function cornerDimensions(editor: SketchEditor): DimensionValue[] {
  const corner = selectedCorner(editor),
    sketch = editor.sketch;
  if (!corner || !sketch) return [];
  const curve = sketch.curves.find((c) => c.id === corner.a);
  if (curve?.kind !== "segment") return [];
  const p = editor.world.projectLocal(sketch.plane, curve[corner.aEnd]);
  return [
    {
      quantity: "cornerAngle",
      label: "Corner angle",
      unit: "°",
      value: Math.abs(corner.value),
      screen: { x: p.x + 75, y: p.y - 45 },
    },
  ];
}

function translationDimensions(editor: SketchEditor): DimensionValue[] {
  const result: DimensionValue[] = [];
  const widget = transformHandles(editor);
  if (widget && editor.transformAxis) {
    const axis = editor.transformAxis;
    const handle = widget.axes.find((h) => h.axis === axis);
    if (!handle || !editor.sketch) return [];
    const p = editor.world.projectLocal(editor.sketch.plane, handle.point);
    result.push({
      quantity: axisQuantity(axis),
      label: `Move ${editor.world.axisName(axis)}`,
      unit: "mm",
      value: editor.isDragging ? editor.transformDistance : 0,
      screen: { x: p.x + (axis === "x" ? 65 : 0), y: p.y + (axis === "y" ? -30 : 0) },
    });
  }
  return result;
}

function rotationDimension(editor: SketchEditor): DimensionValue[] {
  const selection = selectionFrame(editor),
    sketch = editor.sketch;
  if (!selection || !sketch || (editor.moveMode && !editor.transformRotation)) return [];
  const handle = editor.world.projectLocal(sketch.plane, selection.handle);
  return [
    {
      quantity: "angle",
      label: "Angle",
      unit: "°",
      value: editor.rotationPreview ?? orientation(editor),
      screen: { x: handle.x + (transformHandles(editor) ? 65 : -68), y: handle.y },
    },
  ];
}
