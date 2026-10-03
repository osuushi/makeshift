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
  start(end: CameraPose): void {
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
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      applyCameraPose(world, end);
      world.draw();
      return;
    }
    const started = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / 280),
        amount = 1 - (1 - progress) ** 3;
      applyCameraPose(world, {
        target: start.target.clone().lerp(end.target, amount),
        quaternion: start.quaternion.clone().slerp(end.quaternion, amount),
        distance: THREE.MathUtils.lerp(start.distance, end.distance, amount),
        height: THREE.MathUtils.lerp(start.height, end.height, amount),
      });
      this.frame = progress < 1 ? requestAnimationFrame(step) : null;
      world.draw();
    };
    this.frame = requestAnimationFrame(step);
    world.draw();
  }
}
