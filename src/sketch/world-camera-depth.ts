import * as THREE from "three";
import { canonicalPlanes } from "../preferences/canonical-planes.js";
import { fitCameraDepth } from "./camera-depth.js";
import { planeVisibilityTarget } from "./canonical-plane-visibility.js";
import { planeIds, planes } from "./planes.js";
import type { World } from "./world.js";

export function fitWorldCameraDepth(world: World): void {
  const settings = canonicalPlanes();
  const direction = world.camera.position.clone().sub(world.target).normalize();
  const references = world.activeFrame
    ? [world.activeFrame]
    : planeIds
        .filter((id) => {
          const frame = planes[id];
          const normal = new THREE.Vector3(...frame.u).cross(new THREE.Vector3(...frame.v));
          return (
            world.canonicalVisibility.states[id].opacity > 0 ||
            planeVisibilityTarget(direction.dot(normal), settings) > 0
          );
        })
        .map((id) => planes[id]);
  fitCameraDepth(world.camera, world.target, world.height, world.depthBounds(), references);
}
