import * as THREE from "three";
import type { Vector } from "../planes.js";

type Projection = (point: Vector) => { x: number; y: number };
const axes: Vector[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

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

/** Shared spatial frame at the real anchor; never follows displaced hit targets. */
export function moveFrameCue(project: Projection, aligned: number | null): string {
  const planes = axes.map((_, i) => i).filter((i) => aligned === null || i === aligned);
  return (
    planes.map((i) => planeCue(project, axes[(i + 1) % 3], axes[(i + 2) % 3], 0, 64)).join("") +
    axes
      .filter((_, i) => i !== aligned)
      .map((axis) => {
        const a = project([0, 0, 0]);
        const b = project(axis.map((value) => value * 96) as Vector);
        return `<path d="M${a.x},${a.y} L${b.x},${b.y}" fill="none" stroke="var(--handle-dark)" stroke-opacity="0.35" stroke-width="1"/>`;
      })
      .join("")
  );
}
