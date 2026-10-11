import { displayPoints } from "./curve-geometry.js";
import { boundaryPoints } from "./curve-spans.js";
import type { Sketch } from "./document.js";
import { coplanar, type PlaneFrame, type Point, type Vector, worldPoint } from "./planes.js";
import { closedBoundaries } from "./regions.js";

export interface XrayContents {
  paths: Point[][];
  regions: Point[][];
}

/** Project actual visible contents, rather than sketch/plane bounds or selection bounds. */
export function projectXrayContents(
  sketches: readonly Sketch[],
  frame: PlaneFrame,
  project: (point: Vector) => Point,
  unitsPerPixel: number,
): XrayContents {
  const paths: Point[][] = [],
    regions: Point[][] = [];
  for (const sketch of sketches) {
    if (!coplanar(sketch.plane, frame)) continue;
    const screen = (p: Point) => project(worldPoint(sketch.plane, p));
    for (const curve of sketch.curves) paths.push(displayPoints(curve, unitsPerPixel).map(screen));
    for (const boundary of closedBoundaries(sketch.curves))
      regions.push(boundaryPoints(boundary, unitsPerPixel).map(screen));
  }
  return { paths, regions };
}

/** The solid aperture owns cut picking; the soft fringe keeps ordinary depth picking. */
export function xrayContains(contents: XrayContents, point: Point, bleed: number): boolean {
  if (contents.regions.some((polygon) => insidePolygon(polygon, point))) return true;
  const squared = Math.max(1, bleed) ** 2;
  for (const path of contents.paths)
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1],
        b = path[i];
      const dx = b.x - a.x,
        dy = b.y - a.y;
      const length = dx * dx + dy * dy;
      const t = length
        ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length))
        : 0;
      if ((point.x - a.x - t * dx) ** 2 + (point.y - a.y - t * dy) ** 2 <= squared) return true;
    }
  return false;
}

function insidePolygon(polygon: readonly Point[], point: Point): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}
