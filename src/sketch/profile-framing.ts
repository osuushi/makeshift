import * as THREE from "three";
import { type CameraFraming, planeCameraPose } from "./camera-motion.js";
import { boundaryPoints } from "./curve-spans.js";
import type { Sketch } from "./document.js";
import type { SketchEditor } from "./editor.js";
import { type PlaneFrame, type Point, worldPoint } from "./planes.js";
import type { Profile } from "./profiles.js";

export function profileFraming(
  editor: SketchEditor,
  sketch: Sketch,
  profile: Profile,
): CameraFraming {
  const world = editor.world,
    unitsPerPixel = world.height / Math.max(1, world.canvas.clientHeight),
    points = boundaryPoints(profile.outer, unitsPerPixel);
  return planarFraming(editor, sketch.plane, points);
}

export function planarFraming(
  editor: SketchEditor,
  plane: PlaneFrame,
  points: Point[],
): CameraFraming {
  const world = editor.world,
    lowX = points.reduce((low, point) => Math.min(low, point.x), Infinity),
    highX = points.reduce((high, point) => Math.max(high, point.x), -Infinity),
    lowY = points.reduce((low, point) => Math.min(low, point.y), Infinity),
    highY = points.reduce((high, point) => Math.max(high, point.y), -Infinity),
    center = { x: (lowX + highX) / 2, y: (lowY + highY) / 2 },
    aspect = world.canvas.clientWidth / Math.max(1, world.canvas.clientHeight),
    orientation = planeCameraPose(world, plane).quaternion,
    right = new THREE.Vector3(1, 0, 0).applyQuaternion(orientation),
    up = new THREE.Vector3(0, 1, 0).applyQuaternion(orientation),
    u = new THREE.Vector3(...plane.u),
    v = new THREE.Vector3(...plane.v),
    xs = points.map((point) => point.x * right.dot(u) + point.y * right.dot(v)),
    ys = points.map((point) => point.x * up.dot(u) + point.y * up.dot(v)),
    fittedHeight =
      Math.max(
        ys.reduce((high, value) => Math.max(high, value), -Infinity) -
          ys.reduce((low, value) => Math.min(low, value), Infinity),
        (xs.reduce((high, value) => Math.max(high, value), -Infinity) -
          xs.reduce((low, value) => Math.min(low, value), Infinity)) /
          Math.max(aspect, 1e-6),
      ) * 1.5;
  return {
    target: worldPoint(plane, center),
    height: Math.max(0.5, Math.min(10000, fittedHeight)),
  };
}
