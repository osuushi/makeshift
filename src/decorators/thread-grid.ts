import type { ThreadSettings } from "./thread-settings.js";
import { threadDepth } from "./thread-settings.js";

export type Point = { angle: number; z: number };
const tau = 2 * Math.PI;

export function split(polygon: Point[], level: number, phase: (p: Point) => number): Point[][] {
  const lower: Point[] = [],
    upper: Point[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    const da = phase(a) - level,
      db = phase(b) - level;
    if (da <= 0) lower.push(a);
    if (da >= 0) upper.push(a);
    if (da * db < 0) {
      const t = da / (da - db);
      const crossing = { angle: a.angle + t * (b.angle - a.angle), z: a.z + t * (b.z - a.z) };
      lower.push(crossing);
      upper.push(crossing);
    }
  }
  return [lower, upper].filter((p) => p.length >= 3);
}

/** Align straight profile facets with crest/root corners instead of rounding them. */
function profilePatches(polygon: Point[], settings: ThreadSettings): Point[][] {
  // Rounded profiles can cross a quad in opposing corners. Triangular patches
  // keep subsequent cone clipping connected and consistently oriented.
  if (settings.profile === "rounded")
    return polygon.slice(1, -1).map((point, i) => [polygon[0], point, polygon[i + 2]]);
  const hand = settings.hand === "right" ? 1 : -1;
  const phase = (p: Point) => p.z / settings.pitch - (hand * p.angle) / tau;
  const phases = polygon.map(phase),
    low = Math.min(...phases),
    high = Math.max(...phases);
  let patches = [polygon];
  const tip = settings.tipTruncation / threadDepth(settings);
  const corners =
    settings.profile === "triangle"
      ? tip
        ? settings.cut === "rod"
          ? [tip / 2, 0.5, 1 - tip / 2]
          : [0, (1 - tip) / 2, (1 + tip) / 2]
        : [0, 0.5]
      : [1 / 16, 3 / 8, 5 / 8, 15 / 16];
  for (let turn = Math.floor(low); turn <= Math.floor(high); turn++)
    for (const corner of corners) {
      const level = turn + corner;
      if (level > low + 1e-12 && level < high - 1e-12)
        patches = patches.flatMap((p) => split(p, level, phase));
    }
  return patches;
}

/** Insert the cone/profile intersection so mesh facets preserve the clipping crease. */
function taperPatches(polygon: Point[], crease?: (angle: number, z: number) => number): Point[][] {
  if (!crease) return [polygon];
  const values = polygon.map(({ angle, z }) => crease(angle, z));
  if (Math.min(...values) >= -1e-10 || Math.max(...values) <= 1e-10) return [polygon];
  return split(polygon, 0, ({ angle, z }) => crease(angle, z));
}

export function threadGrid(
  segments: number,
  steps: number,
  bounds: [number, number],
  settings: ThreadSettings,
  taperBounds: [number, number] = bounds,
  crease?: (angle: number, z: number) => number,
) {
  const coords: Point[] = [],
    triangles: number[][] = [];
  const indexes = new Map<string, number>();
  const index = (point: Point) => {
    const angle = Math.abs(point.angle - tau) < 1e-10 ? 0 : point.angle;
    const key = `${Math.round(angle * 1e10)}/${Math.round(point.z * 1e10)}`;
    let id = indexes.get(key);
    if (id === undefined) {
      id = coords.length;
      indexes.set(key, id);
      coords.push({ angle, z: point.z });
    }
    return id;
  };
  const rows = Array.from(
    { length: steps + 1 },
    (_, i) => bounds[0] + ((bounds[1] - bounds[0]) * i) / steps,
  );
  const transitions = [taperBounds[0] + settings.startTaper, taperBounds[1] - settings.endTaper];
  if (settings.startTaper && settings.endTaper && transitions[0] > transitions[1])
    transitions.push(
      (taperBounds[0] * settings.endTaper + taperBounds[1] * settings.startTaper) /
        (settings.startTaper + settings.endTaper),
    );
  for (const z of transitions)
    if (z > bounds[0] && z < bounds[1] && !rows.some((value) => Math.abs(value - z) < 1e-10))
      rows.push(z);
  rows.sort((a, b) => a - b);
  for (let row = 0; row < rows.length - 1; row++)
    for (let col = 0; col < segments; col++) {
      const a = (tau * col) / segments,
        b = (tau * (col + 1)) / segments;
      const polygon = [
        { angle: a, z: rows[row] },
        { angle: b, z: rows[row] },
        { angle: b, z: rows[row + 1] },
        { angle: a, z: rows[row + 1] },
      ];
      for (const patch of profilePatches(polygon, settings).flatMap((patch) =>
        taperPatches(patch, crease),
      )) {
        const ids = patch.map(index);
        for (let i = 1; i < ids.length - 1; i++)
          if (new Set([ids[0], ids[i], ids[i + 1]]).size === 3)
            triangles.push([ids[0], ids[i], ids[i + 1]]);
      }
    }
  return { coords, triangles };
}
