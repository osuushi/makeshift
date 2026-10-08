import * as THREE from "three";
import { canonicalPlanes } from "../preferences/canonical-planes.js";
import { coordinatePlaneDepth } from "./coordinate-plane-depth.js";
import type { PlaneBounds } from "./plane-bounds.js";
import { type PlaneFrame, type PlaneId, planeIds, planes } from "./planes.js";
import { stableClipping } from "./stable-clipping.js";
import type { World } from "./world.js";

export type PlanePatch = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
export type PlaneTarget = { id: PlaneId; frame: PlaneFrame; mesh: PlanePatch };
export function planePatch(color: string): PlanePatch {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.224,
      side: THREE.DoubleSide,
      depthWrite: false,
      stencilWrite: true,
      stencilRef: 2,
      stencilFuncMask: 2,
      stencilWriteMask: 0,
      stencilFunc: THREE.NotEqualStencilFunc,
    }),
  );
  stableClipping(mesh.material);
  mesh.renderOrder = 8;
  return mesh;
}
export function positionPlanePatch(mesh: PlanePatch, frame: PlaneFrame, bounds: PlaneBounds): void {
  const u = new THREE.Vector3(...frame.u),
    v = new THREE.Vector3(...frame.v);
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, u.clone().cross(v)));
  mesh.position
    .set(...frame.origin)
    .addScaledVector(u, (bounds.minX + bounds.maxX) / 2)
    .addScaledVector(v, (bounds.minY + bounds.maxY) / 2);
  mesh.scale.set(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 1);
  mesh.updateMatrixWorld();
}
export function createPlaneTargets(world: World): PlaneTarget[] {
  return planeIds.map((id) => {
    const mesh = planePatch(planeTargetBaseColor(id));
    coordinatePlaneDepth(mesh.material, world.camera, world.target, () => world.height);
    mesh.userData.planeTarget = id;
    world.scene.add(mesh);
    return { id, frame: planes[id], mesh };
  });
}
export function disposePlaneTarget(world: World, target: PlaneTarget): void {
  world.scene.remove(target.mesh);
  target.mesh.geometry.dispose();
  target.mesh.material.dispose();
}
export function planeTargetBaseColor(id: PlaneId): string {
  return canonicalPlanes().colors[id];
}
