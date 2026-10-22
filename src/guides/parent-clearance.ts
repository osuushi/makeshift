import { displayPoints } from "../sketch/curve-geometry.js";
import type { SketchEditor } from "../sketch/editor.js";
import { type Point, type Vector, worldPoint } from "../sketch/planes.js";
import type { GuideAnchor } from "./types.js";

function vertices(values: readonly number[]): Vector[] {
  const points: Vector[] = [];
  for (let i = 0; i < values.length; i += 3) points.push([values[i], values[i + 1], values[i + 2]]);
  return points;
}

function parents(editor: SketchEditor, anchor: GuideAnchor): Vector[][] {
  if (anchor.kind === "sketch-curve") {
    const sketch = editor.display.sketches.find((s) => s.id === anchor.sketch),
      curve = sketch?.curves.find((c) => c.id === anchor.curve);
    if (!sketch || !curve) return [];
    const unit =
      editor.world.height / Math.max(1, editor.world.canvas.getBoundingClientRect().height);
    return [displayPoints(curve, unit).map((p) => worldPoint(sketch.plane, p))];
  }
  const body = editor.display.bodies?.find((b) => b.id === anchor.body);
  if (!body) return [];
  if (anchor.kind === "body-center") return [body.faces.flatMap((f) => vertices(f.vertices))];
  if (anchor.kind === "body-faces")
    return anchor.faces.map((id) => vertices(body.faces.find((f) => f.id === id)?.vertices ?? []));
  const ids = anchor.kind === "body-edge" ? [anchor.edge] : anchor.edges;
  return ids.map((id) => vertices(body.edges.find((e) => e.id === id)?.points ?? []));
}

/** Longest continuous exposed span on the parent's larger screen axis. */
export function exposedSpan(points: readonly Point[], markers: readonly Point[]): number {
  if (!points.length) return 0;
  const low = { x: Infinity, y: Infinity },
    high = { x: -Infinity, y: -Infinity };
  for (const p of points)
    for (const axis of ["x", "y"] as const) {
      low[axis] = Math.min(low[axis], p[axis]);
      high[axis] = Math.max(high[axis], p[axis]);
    }
  const axis = high.x - low.x >= high.y - low.y ? "x" : "y";
  // Guide marker hit targets are 20 CSS pixels wide, independent of zoom/DPR.
  const cuts = markers
    .filter(
      (p) => p.x + 10 >= low.x && p.x - 10 <= high.x && p.y + 10 >= low.y && p.y - 10 <= high.y,
    )
    .map((p) => [Math.max(low[axis], p[axis] - 10), Math.min(high[axis], p[axis] + 10)])
    .sort((a, b) => a[0] - b[0]);
  let start = low[axis],
    longest = 0;
  for (const [from, to] of cuts) {
    longest = Math.max(longest, from - start);
    start = Math.max(start, to);
  }
  return Math.max(longest, high[axis] - start);
}

export function parentClearance(
  editor: SketchEditor,
  anchor: GuideAnchor,
  markers: readonly Point[],
): boolean {
  const sources = parents(editor, anchor);
  return (
    sources.length > 0 &&
    sources.every(
      (points) =>
        exposedSpan(
          points.map((p) => editor.world.project(p)),
          markers,
        ) >= 64,
    )
  );
}
