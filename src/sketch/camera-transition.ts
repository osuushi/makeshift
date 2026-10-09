import * as THREE from "three";
import { applyCameraPose, type CameraPose } from "./camera-motion.js";
import type { World } from "./world.js";

/** The World camera's bounded animation; navigation history observes its completion. */
export class CameraTransition {
  private frame: number | null = null;
  constructor(private world: World) {}
  get active(): boolean {
    return this.frame !== null;
  }
  cancel(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }
  start(
    end: CameraPose,
    completed: () => void = () => {},
    anchor?: { pivot: THREE.Vector3; axis: THREE.Vector3 },
  ): void {
    const world = this.world;
    world.cancelCameraMotion();
    world.camera.lookAt(world.target);
    world.camera.updateMatrixWorld();
    const start = {
      target: world.target.clone(),
      quaternion: world.camera.quaternion.clone(),
      distance: world.camera.position.distanceTo(world.target),
      height: world.height,
    };
    const pivot = anchor?.pivot;
    const previousUp = anchor?.axis.clone().applyQuaternion(start.quaternion.clone().invert());
    const nextUp = anchor?.axis.clone().applyQuaternion(end.quaternion.clone().invert());
    const keepVertical =
      previousUp &&
      nextUp &&
      Math.abs(previousUp.x) < 1e-10 &&
      previousUp.y > 1e-8 &&
      Math.abs(nextUp.x) < 1e-10 &&
      nextUp.y > 1e-8;
    const localPivot = pivot
      ?.clone()
      .sub(start.target)
      .applyQuaternion(start.quaternion.clone().invert());
    const targetAt = (quaternion: THREE.Quaternion, amount: number) =>
      pivot && localPivot
        ? pivot.clone().sub(localPivot.clone().applyQuaternion(quaternion))
        : start.target.clone().lerp(end.target, amount);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      applyCameraPose(world, { ...end, target: targetAt(end.quaternion, 1) });
      completed();
      world.draw();
      return;
    }
    const started = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / 280),
        amount = 1 - (1 - progress) ** 3;
      const quaternion = start.quaternion.clone().slerp(end.quaternion, amount);
      if (keepVertical && anchor) keepAxisVertical(quaternion, anchor.axis);
      applyCameraPose(world, {
        target: targetAt(quaternion, amount),
        quaternion,
        distance: THREE.MathUtils.lerp(start.distance, end.distance, amount),
        height: THREE.MathUtils.lerp(start.height, end.height, amount),
      });
      this.frame = progress < 1 ? requestAnimationFrame(step) : null;
      if (progress === 1) completed();
      world.draw();
    };
    this.frame = requestAnimationFrame(step);
    world.draw();
  }
}

/** Correct interpolation roll without changing its interpolated viewing direction. */
function keepAxisVertical(quaternion: THREE.Quaternion, axis: THREE.Vector3): void {
  const projected = axis.clone().applyQuaternion(quaternion.clone().invert());
  quaternion.multiply(
    new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      Math.atan2(-projected.x, projected.y),
    ),
  );
}
