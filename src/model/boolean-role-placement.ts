import type { Point, Vector } from "../sketch/planes.js";
import type { Body } from "./body.js";

export interface RoleBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Conservative screen footprint of the accepted operand, independent of its cut preview. */
export function roleBounds(body: Body, project: (point: Vector) => Point): RoleBounds {
  const bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  for (let i = 0; i < 8; i++) {
    const point = project([
      body.bounds[i & 1 ? 3 : 0],
      body.bounds[i & 2 ? 4 : 1],
      body.bounds[i & 4 ? 5 : 2],
    ]);
    bounds.left = Math.min(bounds.left, point.x);
    bounds.right = Math.max(bounds.right, point.x);
    bounds.top = Math.min(bounds.top, point.y);
    bounds.bottom = Math.max(bounds.bottom, point.y);
  }
  return bounds;
}

/** Minimize other operand overlaps first, then distance to this operand's screen center. */
export function placeBooleanRole(
  own: RoleBounds,
  others: readonly RoleBounds[],
  placed: readonly Point[],
  viewport: { width: number; height: number },
): Point {
  const radius = 16;
  const anchor = { x: (own.left + own.right) / 2, y: (own.top + own.bottom) / 2 };
  const clampX = (x: number) => Math.max(radius, Math.min(viewport.width - radius, x));
  const clampY = (y: number) => Math.max(radius, Math.min(viewport.height - radius, y));
  const obstacles = others.map((box) => ({
    left: box.left - radius,
    right: box.right + radius,
    top: box.top - radius,
    bottom: box.bottom + radius,
  }));
  const controls = placed.map((point) => ({
    left: point.x - 36,
    right: point.x + 36,
    top: point.y - 36,
    bottom: point.y + 36,
  }));
  // The overlap count is constant inside each rectangle arrangement cell. Its
  // nearest point to the anchor lies on these boundaries or the anchor axes.
  const boundaries = [...obstacles, ...controls];
  const xs = new Set([
    clampX(anchor.x),
    radius,
    clampX(viewport.width),
    ...boundaries.flatMap((box) => [clampX(box.left), clampX(box.right)]),
  ]);
  const ys = new Set([
    clampY(anchor.y),
    radius,
    clampY(viewport.height),
    ...boundaries.flatMap((box) => [clampY(box.top), clampY(box.bottom)]),
  ]);
  const contains = (box: RoleBounds, point: Point) =>
    point.x > box.left && point.x < box.right && point.y > box.top && point.y < box.bottom;
  let best = { x: clampX(anchor.x), y: clampY(anchor.y) };
  let score = [Infinity, Infinity, Infinity];
  for (const x of xs)
    for (const y of ys) {
      const point = { x, y };
      const next = [
        obstacles.filter((box) => contains(box, point)).length,
        controls.filter((box) => contains(box, point)).length,
        (x - anchor.x) ** 2 + (y - anchor.y) ** 2,
      ];
      if (
        next[0] < score[0] ||
        (next[0] === score[0] &&
          (next[1] < score[1] || (next[1] === score[1] && next[2] < score[2])))
      ) {
        best = point;
        score = next;
      }
    }
  return best;
}
