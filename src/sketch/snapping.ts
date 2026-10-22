import { sketchGuideTargets } from "../guides/snapping.js";
import { planarBodyEdges } from "../model/planar-body-edges.js";
import { drawingAttachment } from "./creation-links.js";
import { curveFeatures } from "./curve-geometry.js";
import { curveIntersections } from "./curve-intersections.js";
import { snapToEdge } from "./edge-snapping.js";
import type { SketchEditor } from "./editor.js";
import type { Point } from "./planes.js";
import { distance } from "./point-math.js";
import { rectangleFrame } from "./rectangle-edit.js";

export function snapped(
  editor: SketchEditor,
  point: Point,
  exclude: ReadonlySet<string>,
  bypass: boolean,
  gridOrigin: Point = { x: 0, y: 0 },
  gridFactor = 1,
): Point {
  editor.snap = null;
  const step = editor.world.spacing * gridFactor;
  const grid = editor.gridSnap
    ? {
        x: gridOrigin.x + Math.round((point.x - gridOrigin.x) / step) * step,
        y: gridOrigin.y + Math.round((point.y - gridOrigin.y) / step) * step,
      }
    : { ...point };
  if (bypass) {
    if (editor.gridSnap) editor.snap = { ...grid, label: "Grid" };
    return grid;
  }
  const tolerance = (8 * editor.world.height) / editor.world.canvas.clientHeight;
  const sketch = editor.store.data.sketches.find((item) => item.id === editor.sketch?.id);
  const curves = (sketch?.curves ?? []).filter((curve) => !exclude.has(curve.id));
  const bodyCurves =
    editor.world.activeFrame && editor.bodiesVisible
      ? planarBodyEdges(editor.store.data, editor.world.activeFrame)
          .filter(({ edge }) =>
            editor.store.data.bodies?.some(
              (b) => editor.visibility.visible(b.id) && b.edges.includes(edge),
            ),
          )
          .map(({ curve }) => curve)
      : [];
  const targets = [
    ...sketchGuideTargets(editor, exclude),
    ...curves.flatMap(curveFeatures),
    ...bodyCurves
      .flatMap(curveFeatures)
      .map((target) => ({ ...target, label: `Body ${target.label.toLowerCase()}` })),
  ];
  for (const [i, a] of curves.entries())
    for (const b of curves.slice(i + 1))
      targets.push(...curveIntersections(a, b).map((point) => ({ point, label: "Intersection" })));
  for (const group of sketch?.groups ?? [])
    if (!group.members.some((id) => exclude.has(id)) && sketch)
      targets.push({ point: rectangleFrame(sketch, group).center, label: "Center" });
  const closest = targets
    .filter((target) => distance(target.point, point) <= tolerance)
    .sort((a, b) => distance(a.point, point) - distance(b.point, point))[0];
  if (closest) {
    editor.snap = {
      ...closest.point,
      label: attachmentLabel(editor, sketch, closest.point, closest.label),
    };
    return closest.point;
  }
  const edge = snapToEdge(
    [...curves, ...bodyCurves],
    point,
    tolerance,
    editor.gridSnap ? grid : null,
    step,
  );
  if (edge) {
    editor.snap = { ...edge.point, label: attachmentLabel(editor, sketch, edge.point, edge.label) };
    return edge.point;
  }
  const alignment = alignedGrid(targets, point, grid, tolerance);
  if (alignment.label === "Alignment" || editor.gridSnap) editor.snap = alignment;
  return { x: alignment.x, y: alignment.y };
}

function alignedGrid(
  targets: { point: Point }[],
  point: Point,
  grid: Point,
  tolerance: number,
): Point & { label: string } {
  const guide = (axis: "x" | "y") =>
    targets
      .filter((target) => Math.abs(target.point[axis] - point[axis]) < tolerance)
      .sort(
        (a, b) => Math.abs(a.point[axis] - point[axis]) - Math.abs(b.point[axis] - point[axis]),
      )[0];
  const x = guide("x"),
    y = guide("y");
  return {
    x: x?.point.x ?? grid.x,
    y: y?.point.y ?? grid.y,
    label: x || y ? "Alignment" : "Grid",
  };
}

function attachmentLabel(
  editor: SketchEditor,
  sketch: import("./document.js").Sketch | undefined,
  point: Point,
  fallback: string,
): string {
  if (!sketch || editor.tool === "select" || editor.tool === "trim") return fallback;
  const attachment = drawingAttachment(sketch, point);
  return attachment?.kind === "coincident"
    ? "Fuse"
    : attachment?.kind === "point-on-edge"
      ? "Coincident"
      : fallback;
}
