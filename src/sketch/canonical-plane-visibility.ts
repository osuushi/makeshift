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
    planeIds.map((id) => [
      id,
      {
        opacity: 0,
        target: 0,
        selectable: false,
        role: "hidden" as "primary" | "secondary" | "hidden",
      },
    ]),
  ) as Record<
    PlaneId,
    {
      opacity: number;
      target: number;
      selectable: boolean;
      role: "primary" | "secondary" | "hidden";
    }
  >;
  update(
    camera: THREE.Camera,
    settings: CanonicalPlaneSettings,
    now: number,
    reducedMotion = false,
  ): boolean {
    const direction = camera.getWorldDirection(new THREE.Vector3());
    // An event-driven renderer may have been idle for minutes. Start a fresh
    // fade on that first frame instead of counting idle time toward the new target.
    const first = this.previous === null;
    const gap = first ? Infinity : now - (this.previous as number);
    this.previous = now;
    const ranked = planeIds
      .map((id) => {
        const frame = planes[id];
        const normal = new THREE.Vector3(...frame.u).cross(new THREE.Vector3(...frame.v));
        return { id, facing: Math.abs(direction.dot(normal)) };
      })
      .sort((a, b) =>
        Math.abs(b.facing - a.facing) <= 1e-12
          ? planeIds.indexOf(a.id) - planeIds.indexOf(b.id)
          : b.facing - a.facing,
      );
    let moving = false;
    for (const id of planeIds) {
      const state = this.states[id];
      state.role = id === ranked[0].id ? "primary" : id === ranked[1].id ? "secondary" : "hidden";
      const facing = ranked.find((entry) => entry.id === id)?.facing ?? 0;
      // Always retain a primary reference. The runner-up supplies a faint
      // orientation cue, even below the preference's ordinary angle cutoff.
      const edgeFade = Math.min(1, Math.max(0, (facing - 0.005) / 0.195));
      const target =
        state.role === "primary"
          ? 1
          : state.role === "secondary"
            ? edgeFade * (0.14 + 0.08 * planeVisibilityTarget(facing, settings))
            : 0;
      // Slow rendered frames still advance an existing fade. Only a new target
      // after a genuinely idle viewport starts with no accumulated time.
      const elapsed = !first && gap > 1000 && state.target !== target ? 0 : gap;
      state.target = target;
      state.opacity = mixPlaneVisibility(
        state.opacity,
        state.target,
        elapsed,
        reducedMotion ? 0 : settings.fadeMilliseconds,
      );
      state.selectable =
        state.role === "primary" &&
        selectablePlane(state.opacity, state.target, settings.selectableMinimum);
      moving ||= state.opacity !== state.target;
    }
    return moving;
  }
}
