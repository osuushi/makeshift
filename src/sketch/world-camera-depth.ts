import * as THREE from "three";
import { fitCameraDepth } from "./camera-depth.js";
import { planeIds, planes } from "./planes.js";
import type { World } from "./world.js";

export function fitWorldCameraDepth(world: World): void {
  const direction = world.camera.position.clone().sub(world.target).normalize();
  const references = world.activeFrame
    ? [world.activeFrame]
    : planeIds
        .filter((id) => {
          const frame = planes[id];
          const normal = new THREE.Vector3(...frame.u).cross(new THREE.Vector3(...frame.v));
          // Camera depth must depend on geometry, not the current opacity spring.
          // Nearly edge-on planes have no finite useful viewport depth extent.
          return Math.abs(direction.dot(normal)) >= 0.005;
        })
        .map((id) => planes[id]);
  fitCameraDepth(world.camera, world.target, world.height, world.depthBounds(), references);
}
