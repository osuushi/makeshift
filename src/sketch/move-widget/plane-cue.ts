import * as THREE from "three";
import type { Vector } from "../planes.js";

type Projection = (point: Vector) => { x: number; y: number };

/** Two cells in each direction, projected without the glyph readability correction. */
export function planeCue(
  project: Projection,
  u: Vector,
  v: Vector,
  low: number,
  high: number,
): string {
  const point = (x: number, y: number) => {
    const p = project(u.map((value, i) => value * x + v[i] * y) as Vector);
    return `${p.x},${p.y}`;
  };
  const corners = [
    [low, low],
    [high, low],
    [high, high],
    [low, high],
  ];
  const middle = (low + high) / 2;
  return `<g class="move-plane-cue" pointer-events="none" aria-hidden="true">
    <polygon points="${corners.map(([x, y]) => point(x, y)).join(" ")}" fill="var(--handle-light)" fill-opacity="0.2" stroke="var(--handle-dark)" stroke-opacity="0.28" stroke-width="0.8"/>
    <path d="M${point(low, middle)} L${point(high, middle)} M${point(middle, low)} L${point(middle, high)}" fill="none" stroke="var(--handle-dark)" stroke-opacity="0.22" stroke-width="0.7"/>
  </g>`;
}

export function rotationPlaneCue(camera: THREE.Camera, u: Vector, v: Vector): string {
  const inverse = camera.quaternion.clone().invert();
  return planeCue(
    (point) => {
      const p = new THREE.Vector3(...point).applyQuaternion(inverse);
      return { x: p.x, y: -p.y };
    },
    u,
    v,
    -19,
    19,
  );
}
