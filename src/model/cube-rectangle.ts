import type { SketchEditor } from "../sketch/editor.js";
import type { PlaneFrame, Point } from "../sketch/planes.js";
import { planeIds, planes } from "../sketch/planes.js";
import type { World } from "../sketch/world.js";
import { pickPlaneInterior } from "./plane-interior-pick.js";

export function cubeHoverPlane(editor: SketchEditor, screen: Point): PlaneFrame {
  return (
    pickPlaneInterior(editor, screen, (frame) => !Object.values(planes).includes(frame))?.frame ??
    cubePlane(editor.world)
  );
}

export function cubePlane(world: World) {
  return planes[
    planeIds.find((id) => world.canonicalVisibility.states[id].role === "primary") ?? "XY"
  ];
}

/** Nearest one-significant-digit millimeter size to a projected viewport fraction. */
export function cubeDefaultSize(world: World, plane = cubePlane(world)): number {
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

export function cubeRectangle(
  anchor: Point,
  tip: Point | null,
  size: number,
  square: boolean,
  symmetric: boolean,
) {
  let dx = tip ? tip.x - anchor.x : size / (symmetric ? 2 : 1);
  let dy = tip ? tip.y - anchor.y : size / (symmetric ? 2 : 1);
  if (square) {
    const extent = Math.max(Math.abs(dx), Math.abs(dy));
    dx = (dx < 0 ? -1 : 1) * extent;
    dy = (dy < 0 ? -1 : 1) * extent;
  }
  const other = { x: anchor.x + dx, y: anchor.y + dy };
  const start = symmetric ? { x: anchor.x - dx, y: anchor.y - dy } : anchor;
  return {
    a: { x: Math.min(start.x, other.x), y: Math.min(start.y, other.y) },
    b: { x: Math.max(start.x, other.x), y: Math.max(start.y, other.y) },
    width: Math.abs(other.x - start.x),
    height: Math.abs(other.y - start.y),
    symmetric,
  };
}
