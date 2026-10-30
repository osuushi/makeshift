import * as THREE from "three";
import { clearTransformArrow } from "../model/transform-clearance.js";
import { transformLayerEnabled } from "../model/transform-layers.js";
import { bowGuides } from "./arc-edit.js";
import type { SketchEditor } from "./editor.js";
import { coneVisible } from "./move-widget/cone.js";
import { rotationOffset, rotationVisible, widgetRadius } from "./move-widget/geometry.js";
import { type Point, worldPoint } from "./planes.js";
import { hasTransformWidget, selectionFrame } from "./selection-frame.js";
export function transformHandles(editor: SketchEditor) {
  const frame = selectionFrame(editor),
    sketch = editor.sketch;
  if (!frame || !sketch || !hasTransformWidget(editor)) return null;
  const unit = editor.world.height / editor.world.canvas.clientHeight;
  const center = frame.pivot;
  const axes = (["x", "y"] as const).map((axis) => ({
    axis,
    point: {
      x: center.x + (axis === "x" ? widgetRadius * unit : 0),
      y: center.y + (axis === "y" ? widgetRadius * unit : 0),
    },
  }));
  if (editor.moveMode)
    for (const handle of axes) {
      const pivot = worldPoint(sketch.plane, center);
      const tip = clearTransformArrow(editor, pivot, worldPoint(sketch.plane, handle.point));
      const delta = new THREE.Vector3(...tip).sub(new THREE.Vector3(...pivot));
      handle.point = {
        x: center.x + delta.dot(new THREE.Vector3(...sketch.plane.u)),
        y: center.y + delta.dot(new THREE.Vector3(...sketch.plane.v)),
      };
    }
  // A bow handle owns its visible position. Move/M hides bow guides and exposes
  // every transform arrow when the two affordances would otherwise overlap.
  const guides = bowGuides(editor);
  const rotation = { x: center.x + rotationOffset * unit, y: center.y + rotationOffset * unit };
  if (editor.moveMode) {
    const tip = clearTransformArrow(
      editor,
      worldPoint(sketch.plane, center),
      worldPoint(sketch.plane, rotation),
    );
    const delta = new THREE.Vector3(...tip).sub(new THREE.Vector3(...sketch.plane.origin));
    rotation.x = delta.dot(new THREE.Vector3(...sketch.plane.u));
    rotation.y = delta.dot(new THREE.Vector3(...sketch.plane.v));
  }
  return {
    center,
    axes: axes.filter(
      (axis) =>
        coneVisible(editor.world.camera, axis.axis === "x" ? sketch.plane.u : sketch.plane.v) &&
        (!editor.moveMode || transformLayerEnabled(editor, "move")) &&
        !guides.some(
          (guide) =>
            Math.hypot(axis.point.x - guide.point.x, axis.point.y - guide.point.y) < 20 * unit,
        ),
    ),
    rotationVisible:
      sketchRotationVisible(editor) &&
      (!editor.moveMode || transformLayerEnabled(editor, "rotate")),
    rotation,
  };
}
export function sketchRotationVisible(editor: SketchEditor): boolean {
  const plane = editor.sketch?.plane;
  return (
    !!plane &&
    rotationVisible(
      editor.world.camera,
      new THREE.Vector3(...plane.u).cross(new THREE.Vector3(...plane.v)).toArray() as [
        number,
        number,
        number,
      ],
    )
  );
}
export function axisQuantity(axis: "x" | "y") {
  return axis === "x" ? ("translateX" as const) : ("translateY" as const);
}
export function translatedPoint(point: Point, axis: "x" | "y", value: number): Point {
  return { ...point, [axis]: point[axis] + value };
}
