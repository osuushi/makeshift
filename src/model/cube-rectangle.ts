import type { Point } from "../sketch/planes.js";
import { planeIds, planes } from "../sketch/planes.js";
import type { World } from "../sketch/world.js";

export function cubePlane(world: World) {
  return planes[
    planeIds.find((id) => world.canonicalVisibility.states[id].role === "primary") ?? "XY"
  ];
}

/** Nearest one-significant-digit millimeter size to a projected viewport fraction. */
export function cubeDefaultSize(world: World): number {
  const plane = cubePlane(world);
  const points = [
    { x: -0.5, y: -0.5 },
    { x: 0.5, y: -0.5 },
    { x: 0.5, y: 0.5 },
    { x: -0.5, y: 0.5 },
  ].map((p) => world.projectLocal(plane, p));
  const extent = Math.max(
    Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x)),
    Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y)),
  );
  const target = Math.min(world.canvas.clientWidth, world.canvas.clientHeight) / (8 * extent);
  const step = 10 ** Math.floor(Math.log10(target));
  return Math.round(target / step) * step;
}

export function cubeRectangle(center: Point, tip: Point | null, size: number, square: boolean) {
  let halfWidth = tip ? Math.abs(tip.x - center.x) : size / 2;
  let halfHeight = tip ? Math.abs(tip.y - center.y) : size / 2;
  if (square) halfWidth = halfHeight = Math.max(halfWidth, halfHeight);
  return {
    a: { x: center.x - halfWidth, y: center.y - halfHeight },
    b: { x: center.x + halfWidth, y: center.y + halfHeight },
    width: 2 * halfWidth,
    height: 2 * halfHeight,
  };
}
