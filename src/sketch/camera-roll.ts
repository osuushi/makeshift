import { rollCamera } from "./camera-motion.js";
import { levelOrientation } from "./camera-orbit.js";
import type { Point } from "./planes.js";
import type { World } from "./world.js";

/** Resolve the snapped destination before moving, then approach it monotonically. */
export function snappedRoll(view: Pick<World, "camera" | "target">, radians: number): number {
  const camera = view.camera.clone();
  camera.lookAt(view.target);
  camera.updateMatrixWorld();
  const axis = camera.position.clone().sub(view.target).normalize();
  camera.up.applyAxisAngle(axis, radians);
  const turned = { camera, target: view.target.clone() };
  camera.lookAt(turned.target);
  camera.updateMatrixWorld();
  const correction = camera.quaternion.clone().invert().multiply(levelOrientation(turned));
  return radians + 2 * Math.atan2(correction.z, correction.w);
}

/** Incremental roll allows simultaneous pan/pinch without overwriting their changes. */
export class CameraRoll {
  private frame: number | null = null;
  private offset: Point = { x: 0, y: 0 };
  constructor(private world: World) {}
  get active(): boolean {
    return this.frame !== null;
  }
  cancel(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }
  updateAnchor(offset: Point): void {
    this.offset = offset;
  }
  start(radians: number, offset: Point, viewportHeight: number): void {
    this.world.navigation.begin();
    this.world.cancelCameraMotion();
    this.offset = offset;
    const angle = snappedRoll(this.world, radians);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      rollCamera(this.world, angle, offset, viewportHeight);
      this.world.requestDraw();
      return;
    }
    const started = performance.now();
    let applied = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / 280);
      const next = angle * (1 - (1 - progress) ** 3);
      rollCamera(this.world, next - applied, this.offset, viewportHeight);
      applied = next;
      this.frame = progress < 1 ? requestAnimationFrame(step) : null;
      this.world.requestDraw();
    };
    this.frame = requestAnimationFrame(step);
  }
}
