import { radiusEdit, replaceBow } from "./arc-edit.js";
import { bowThrough } from "./arc-geometry.js";
import { straightBezier } from "./bezier-edit.js";
import { circleRadius } from "./circle-edit.js";
import { validateNumeric } from "./constraint-geometry.js";
import { appendSelection, copySelection } from "./copy-selection.js";
import { attachmentSnap, creationLinks } from "./creation-links.js";
import { updateDimensionLock } from "./dimension-locks.js";
import type { Sketch } from "./document.js";
import type { Drag } from "./drag-state.js";
import type { SketchEditor } from "./editor.js";
import { editFilletRadius, existingFillet } from "./fillet-edit.js";
import { filletRadiusAt } from "./fillet-radius.js";
import { lineDimension, movePoint, transformSelection } from "./line-edit.js";
import type { Point } from "./planes.js";
import { dragPoints } from "./point-drag.js";
import { add, distance, midpoint, subtract } from "./point-math.js";
import {
  dimensionRectangle,
  rectangleFrame,
  replaceCorners,
  resizeRectangle,
} from "./rectangle-edit.js";
import { snapRotation } from "./rotation-snap.js";
import { transformSelected } from "./selection-transform.js";
import { snapped } from "./snapping.js";
import { axisQuantity, translatedPoint } from "./transform-handles.js";

export function rotatedPoint(point: Point, pivot: Point, angle: number): Point {
  const radians = (angle * Math.PI) / 180,
    cos = Math.cos(radians),
    sin = Math.sin(radians),
    delta = subtract(point, pivot);
  return add(pivot, { x: delta.x * cos - delta.y * sin, y: delta.x * sin + delta.y * cos });
}
function applyQuantities(editor: SketchEditor, drag: Drag, sketch: Sketch): Sketch {
  const group = drag.group ?? editor.rectangleContext,
    line = drag.line ?? editor.line?.id,
    circle = drag.circle ?? editor.circle?.id,
    arc = sketch.curves.find((c) => c.id === editor.arc?.id);
  for (const quantity of ["width", "height", "length", "radius", "angle"] as const) {
    const value = drag.quantities[quantity];
    if (value === undefined) continue;
    if (drag.bow && quantity === "radius") {
      const curve = sketch.curves.find((c) => c.id === drag.bow?.curve);
      if (curve && (curve.kind === "segment" || curve.kind === "arc"))
        sketch = radiusEdit(sketch, curve, value, drag.bow.side);
    }
    if (!drag.bow && arc?.kind === "arc" && quantity === "radius")
      sketch = radiusEdit(sketch, arc, value, 1);
    if (circle && quantity === "radius") sketch = circleRadius(sketch, circle, value);
    if (group && (quantity === "width" || quantity === "height"))
      sketch = dimensionRectangle(
        sketch,
        group,
        quantity,
        value,
        drag.symmetric ? undefined : drag.handle,
      );
    if (line && (quantity === "length" || quantity === "angle") && drag.mode !== "rotate")
      sketch = lineDimension(sketch, line, quantity, value);
    if (drag.symmetric && drag.mode === "createLine" && line) {
      const curve = sketch.curves.find((c) => c.id === line);
      if (curve?.kind === "segment") {
        const delta = subtract(drag.start, midpoint(curve.a, curve.b));
        sketch = transformSelection(sketch, new Set([line]), (p) => add(p, delta));
      }
    }
    sketch = updateDimensionLock(editor, quantity, sketch);
  }
  return sketch;
}
export function updateDrag(
  editor: SketchEditor,
  drag: Drag,
  point: Point,
  bypass: boolean,
): Sketch {
  let candidate = drag.sketch;
  if (drag.axis) {
    candidate = axisDrag(editor, drag, point, bypass);
  } else if (drag.bow) {
    candidate = bowDrag(editor, drag, point, bypass);
  } else if (editor.moveMode && drag.mode === "move") {
    const target = snapped(
      editor,
      add(drag.anchor, subtract(point, drag.start)),
      drag.ids,
      bypass,
      drag.anchor,
    );
    candidate = transformSelected(editor, candidate, (p) => add(p, subtract(target, drag.anchor)));
  } else if (drag.pointTargets && drag.wholeMoveIds) {
    const desired = drag.mode === "move" ? add(drag.anchor, subtract(point, drag.start)) : point;
    const target = snapped(
      editor,
      desired,
      drag.ids,
      bypass,
      drag.mode === "move" ? drag.anchor : undefined,
    );
    candidate = dragPoints(
      candidate,
      drag.hits[0],
      drag.pointTargets,
      target,
      drag.wholeMoveIds,
      drag.symmetric,
    );
  } else if (drag.mode === "move") {
    const desired = add(drag.anchor, subtract(point, drag.start));
    const target = snapped(editor, desired, drag.ids, bypass, drag.anchor),
      delta = subtract(target, drag.anchor);
    candidate = transformSelection(candidate, drag.ids, (p) => add(p, delta));
  } else if (drag.mode === "rotate") {
    const from = subtract(drag.start, drag.pivot),
      to = subtract(point, drag.pivot);
    let delta = ((Math.atan2(to.y, to.x) - Math.atan2(from.y, from.x)) * 180) / Math.PI;
    delta = snapRotation(drag.pose + delta, bypass) - drag.pose;
    if (drag.quantities.angle !== undefined) delta = drag.quantities.angle - drag.pose;
    drag.angle = delta;
    editor.rotationPreview = drag.pose + delta;
    editor.snap = null;
    candidate = editor.moveMode
      ? transformSelected(editor, candidate, (p) => rotatedPoint(p, drag.pivot, delta))
      : transformSelection(candidate, drag.ids, (p) => rotatedPoint(p, drag.pivot, delta));
  } else {
    candidate = resizeDrag(editor, drag, point, bypass);
  }
  candidate = finishDragGeometry(editor, drag, candidate);
  drag.copying = drag.symmetric && (drag.mode === "move" || drag.mode === "rotate");
  if (drag.copying) {
    drag.copyIds ??= new Map();
    candidate = appendSelection(drag.sketch, copySelection(candidate, drag.ids, drag.copyIds));
  }
  return candidate;
}
function axisDrag(editor: SketchEditor, drag: Drag, point: Point, bypass: boolean): Sketch {
  let candidate = drag.sketch;
  const axis = drag.axis;
  if (!axis) return drag.sketch;
  const desired = translatedPoint(drag.pivot, axis, point[axis] - drag.start[axis]);
  const target = snapped(editor, desired, drag.ids, bypass, drag.pivot);
  const value = drag.quantities[axisQuantity(axis)] ?? target[axis] - drag.pivot[axis];
  const other = axis === "x" ? "y" : "x";
  if (drag.quantities[axisQuantity(axis)] !== undefined) editor.snap = null;
  else if (editor.snap && Math.abs(target[other] - drag.pivot[other]) > 1e-7)
    editor.snap = { ...translatedPoint(drag.pivot, axis, value), label: "Alignment" };
  editor.transformDistance = value;
  candidate = transformSelected(editor, candidate, (p) => translatedPoint(p, axis, value));
  return candidate;
}
function bowDrag(editor: SketchEditor, drag: Drag, point: Point, bypass: boolean): Sketch {
  let candidate = drag.sketch;
  if (!drag.bow) return candidate;
  const curve = drag.sketch.curves.find((c) => c.id === drag.bow?.curve);
  const target = snapped(editor, point, drag.ids, bypass);
  if (curve && (curve.kind === "segment" || curve.kind === "arc")) {
    const corner = curve.kind === "arc" ? existingFillet(candidate, curve) : null;
    candidate =
      corner && curve.kind === "arc"
        ? (editFilletRadius(
            candidate,
            curve,
            filletRadiusAt(corner, point, editor.gridSnap ? editor.world.spacing : 0),
          ) ?? candidate)
        : replaceBow(candidate, bowThrough(curve, target));
    if (corner && drag.quantities.radius === undefined) validateNumeric(candidate);
  }
  return candidate;
}
function finishDragGeometry(editor: SketchEditor, drag: Drag, candidate: Sketch): Sketch {
  const snapped = attachmentSnap(editor.snap?.label);
  let result = applyQuantities(editor, drag, candidate);
  if (drag.createBezier)
    result = {
      ...result,
      curves: result.curves.map((c) =>
        c.id === drag.line && c.kind === "segment" ? straightBezier(c) : c,
      ),
    };
  if (Object.keys(drag.quantities).length) editor.snap = null;
  return creationLinks(drag, result, snapped);
}

function resizeDrag(editor: SketchEditor, drag: Drag, point: Point, bypass: boolean): Sketch {
  let candidate = drag.sketch;
  const desired =
    drag.mode === "resize" && drag.hits[0]?.kind === "curve"
      ? add(drag.anchor, subtract(point, drag.start))
      : point;
  const target = snapped(editor, desired, drag.ids, bypass);
  if (drag.circle) {
    const circle = candidate.curves.find((curve) => curve.id === drag.circle);
    if (circle?.kind === "circle") {
      candidate = circleRadius(candidate, circle.id, distance(circle.center, target));
      editor.circleAngle = Math.atan2(target.y - circle.center.y, target.x - circle.center.x);
    }
  }
  if (drag.group && drag.handle)
    candidate = resizeRectangle(
      candidate,
      drag.group,
      drag.handle,
      target,
      drag.symmetric && drag.mode === "resize",
    );
  if (drag.group && drag.symmetric && drag.mode === "createRectangle") {
    const frame = rectangleFrame(candidate, drag.group);
    candidate = replaceCorners(
      candidate,
      drag.group,
      frame.corners.map((p) => ({
        x: drag.start.x + 2 * (p.x - frame.center.x),
        y: drag.start.y + 2 * (p.y - frame.center.y),
      })),
    );
  }
  if (drag.endpoint) candidate = movePoint(candidate, drag.endpoint, target);
  if (drag.line) {
    candidate = movePoint(candidate, { curve: drag.line, end: "b" }, target);
    if (drag.symmetric && drag.mode === "createLine")
      candidate = movePoint(
        candidate,
        { curve: drag.line, end: "a" },
        subtract(add(drag.start, drag.start), target),
      );
  }
  return candidate;
}
