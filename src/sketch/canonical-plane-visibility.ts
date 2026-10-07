import * as THREE from "three";
import type { CanonicalPlaneSettings } from "../preferences/canonical-planes.js";
import { type PlaneId, planeIds, planes } from "./planes.js";

export function planeVisibilityTarget(facing: number, settings: CanonicalPlaneSettings): number {
  const dot = Math.min(1, Math.abs(facing));
  if (dot <= settings.angleCutoff) return 0;
  const fraction =
    settings.fadeWidth === 0
      ? 1
      : Math.min(
          1,
          (dot - settings.angleCutoff) / Math.min(settings.fadeWidth, 1 - settings.angleCutoff),
        );
  const preview = fraction * fraction * (3 - 2 * fraction);
  return preview > settings.fullOpacityAbove ? 1 : preview;
}
export function selectablePlane(current: number, target: number, minimum: number): boolean {
  return current > 0 && target > 0 && current >= minimum && target >= minimum;
}
/** Frame-rate-independent smooth mixing, similar to Unity's damped interpolation. */
export function mixPlaneVisibility(
  current: number,
  target: number,
  elapsed: number,
  duration: number,
): number {
  if (duration === 0) return target;
  const next =
    current + (target - current) * (1 - Math.exp((-Math.max(0, elapsed) * 5) / duration));
  return Math.abs(next - target) < 0.001 ? target : next;
}
export class CanonicalPlaneVisibility {
  private previous: number | null = null;
  readonly states = Object.fromEntries(
    planeIds.map((id) => [id, { opacity: 0, target: 0, selectable: false }]),
  ) as Record<PlaneId, { opacity: number; target: number; selectable: boolean }>;
  update(
    camera: THREE.Camera,
    settings: CanonicalPlaneSettings,
    now: number,
    reducedMotion = false,
  ): boolean {
    const direction = camera.getWorldDirection(new THREE.Vector3());
    // An event-driven renderer may have been idle for minutes. Start a fresh
    // fade on that first frame instead of counting idle time toward the new target.
    const gap = this.previous === null ? Infinity : now - this.previous;
    const elapsed = this.previous !== null && gap > 100 ? 0 : gap;
    this.previous = now;
    let moving = false;
    for (const id of planeIds) {
      const frame = planes[id];
      const normal = new THREE.Vector3(...frame.u).cross(new THREE.Vector3(...frame.v));
      const state = this.states[id];
      state.target = planeVisibilityTarget(direction.dot(normal), settings);
      state.opacity = mixPlaneVisibility(
        state.opacity,
        state.target,
        elapsed,
        reducedMotion ? 0 : settings.fadeMilliseconds,
      );
      state.selectable = selectablePlane(state.opacity, state.target, settings.selectableMinimum);
      moving ||= state.opacity !== state.target;
    }
    return moving;
  }
}
