import * as THREE from "three";
import { type CameraFraming, planeCameraPose } from "./camera-motion.js";
import { boundaryPoints } from "./curve-spans.js";
import type { Sketch } from "./document.js";
import type { SketchEditor } from "./editor.js";
import { worldPoint } from "./planes.js";
import type { Profile } from "./profiles.js";

export function profileFraming(
  editor: SketchEditor,
  sketch: Sketch,
  profile: Profile,
): CameraFraming {
  const world = editor.world,
    unitsPerPixel = world.height / Math.max(1, world.canvas.clientHeight),
    points = boundaryPoints(profile.outer, unitsPerPixel),
    lowX = Math.min(...points.map((point) => point.x)),
    highX = Math.max(...points.map((point) => point.x)),
    lowY = Math.min(...points.map((point) => point.y)),
    highY = Math.max(...points.map((point) => point.y)),
    center = { x: (lowX + highX) / 2, y: (lowY + highY) / 2 },
    aspect = world.canvas.clientWidth / Math.max(1, world.canvas.clientHeight),
    orientation = planeCameraPose(world, sketch.plane).quaternion,
    right = new THREE.Vector3(1, 0, 0).applyQuaternion(orientation),
    up = new THREE.Vector3(0, 1, 0).applyQuaternion(orientation),
    u = new THREE.Vector3(...sketch.plane.u),
    v = new THREE.Vector3(...sketch.plane.v),
    xs = points.map((point) => point.x * right.dot(u) + point.y * right.dot(v)),
    ys = points.map((point) => point.x * up.dot(u) + point.y * up.dot(v)),
    fittedHeight =
      Math.max(
        Math.max(...ys) - Math.min(...ys),
        (Math.max(...xs) - Math.min(...xs)) / Math.max(aspect, 1e-6),
      ) * 1.5;
  return {
    target: worldPoint(sketch.plane, center),
    height: Math.max(0.5, Math.min(10000, fittedHeight)),
  };
}
