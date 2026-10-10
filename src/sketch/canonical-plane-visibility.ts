import * as THREE from "three";
import type { CanonicalPlaneSettings } from "../preferences/canonical-planes.js";
import { dampPlaneOpacity } from "./damped-plane-opacity.js";
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
export class CanonicalPlaneVisibility {
  private previous: number | null = null;
  private primary: PlaneId | null = null;
  readonly states = Object.fromEntries(
    planeIds.map((id) => [
      id,
      {
        opacity: 0,
        velocity: 0,
        target: 0,
        selectable: false,
        role: "hidden" as "primary" | "hidden",
      },
    ]),
  ) as Record<
    PlaneId,
    {
      opacity: number;
      velocity: number;
      target: number;
      selectable: boolean;
      role: "primary" | "hidden";
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
    const current = ranked.find(({ id }) => id === this.primary);
    const switchFacing = Math.sin((settings.switchAngleDegrees * Math.PI) / 180);
    if (!current || current.facing <= switchFacing + 1e-12) this.primary = ranked[0].id;
    let moving = false;
    for (const id of planeIds) {
      const state = this.states[id];
      state.role = id === this.primary ? "primary" : "hidden";
      // Retain the primary until it approaches edge-on; only it supplies a reference.
      const target = state.role === "primary" ? 1 : 0;
      // Slow rendered frames still advance an existing fade. Only a new target
      // after a genuinely idle viewport starts with no accumulated time.
      const elapsed = !first && gap > 1000 && state.target !== target ? 0 : gap;
      state.target = target;
      if (elapsed === 0 && gap > 1000) state.velocity = 0;
      const damped = dampPlaneOpacity(
        state.opacity,
        state.velocity,
        state.target,
        first ? 0 : elapsed,
        first || reducedMotion ? 0 : settings.fadeMilliseconds,
      );
      state.opacity = damped.opacity;
      state.velocity = damped.velocity;
      state.selectable =
        state.role === "primary" &&
        selectablePlane(state.opacity, state.target, settings.selectableMinimum);
      moving ||= state.opacity !== state.target || state.velocity !== 0;
    }
    return moving;
  }
}
