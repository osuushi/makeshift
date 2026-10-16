import * as THREE from "three";
import { displayPoints } from "./curve-geometry.js";
import type { SketchEditor } from "./editor.js";
import type { ModelingTarget } from "./model-selection-state.js";
import { type Point, worldPoint } from "./planes.js";
import { segmentDistance } from "./point-math.js";

/** 44 CSS-pixel touch target around ink; measure after projection on tilted planes. */
export function touchSketchTarget(editor: SketchEditor, screen: Point): ModelingTarget | null {
  const world = editor.world;
  const unitsPerPixel = world.height / world.canvas.clientHeight;
  let nearest = 22;
  let target: ModelingTarget | null = null;
  for (const sketch of editor.display.sketches) {
    if (!editor.visibility.visible(sketch.id)) continue;
    for (const curve of sketch.curves) {
      const points = displayPoints(curve, unitsPerPixel);
      for (let i = 1; i < points.length; i++) {
        const a = new THREE.Vector3(...worldPoint(sketch.plane, points[i - 1]));
        const b = new THREE.Vector3(...worldPoint(sketch.plane, points[i]));
        if (!world.visiblePoint(a) || !world.visiblePoint(b)) continue;
        const distance = segmentDistance(
          screen,
          world.projectLocal(sketch.plane, points[i - 1]),
          world.projectLocal(sketch.plane, points[i]),
        );
        if (distance < nearest) {
          nearest = distance;
          target = { kind: "sketch", sketch: sketch.id };
        }
      }
    }
  }
  return target;
}
