import { curveBounds } from "../sketch/curve-geometry.js";
import type { Sketch } from "../sketch/document.js";
import type { Point } from "../sketch/planes.js";
import type { RevolvedProfile } from "./revolved-profile.js";

export function profileGuides(
  sketch: Sketch,
  { height, endGuides }: Pick<RevolvedProfile, "height" | "endGuides">,
): [Point, Point][] {
  const points = sketch.curves.filter((curve) => !curve.construction).flatMap(curveBounds);
  const low = Math.min(0, ...points.map((point) => point.y));
  const high = Math.max(height, ...points.map((point) => point.y));
  const left = Math.min(0, ...points.map((point) => point.x));
  const right = Math.max(height / 4, ...points.map((point) => point.x));
  const guides: [Point, Point][] = [
    [
      { x: 0, y: low - height / 12 },
      { x: 0, y: high + height / 12 },
    ],
  ];
  if (endGuides) {
    for (const y of [0, height])
      guides.push([
        { x: left * 1.1, y },
        { x: right * 1.1, y },
      ]);
  }
  return guides;
}
