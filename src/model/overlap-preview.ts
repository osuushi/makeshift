import type { SketchEditor } from "../sketch/editor.js";
import { coplanar, type Point, type Vector } from "../sketch/planes.js";
import type { OverlapCandidate } from "./overlap-candidates.js";
import { overlapGeometry, type PreviewGeometry } from "./overlap-geometry.js";
import { sketchPreviewLines } from "./overlap-sketches.js";

const ns = "http://www.w3.org/2000/svg";
const previewWidth = 128,
  previewHeight = 88,
  minimumTargetProportion = 0.5;
/** Keep the camera angle and scene context, zooming small targets into a readable crop. */
export function overlapPreviews(
  editor: SketchEditor,
  candidates: OverlapCandidate[],
  points: readonly (Vector | undefined)[] = [],
): SVGSVGElement[] {
  const targets = candidates.map((c) => {
    const geometry = overlapGeometry(editor, c.target);
    if (c.target.kind === "plane") {
      const frame = c.target.frame;
      for (const sketch of editor.display.sketches) {
        if (!editor.visibility.visible(sketch.id) || !coplanar(sketch.plane, frame)) continue;
        geometry.lines.push(...sketchPreviewLines(editor, sketch));
      }
    }
    return geometry;
  });
  return geometryPreviews(editor, targets, points);
}
/** Render reference geometry and optional exact points in the same scene context. */
export function geometryPreviews(
  editor: SketchEditor,
  targets: PreviewGeometry[],
  points: readonly (Vector | undefined)[] = [],
): SVGSVGElement[] {
  const context = overlapGeometry(editor);
  if (editor.world.active)
    for (const sketch of editor.display.sketches)
      if (editor.visibility.visible(sketch.id))
        context.lines.push(...sketchPreviewLines(editor, sketch));
  const projectWorld = (p: Vector): Point => editor.world.project(p);
  const scene = bounds(
    [context, ...targets, { surfaces: [], lines: points.flatMap((p) => (p ? [[p]] : [])) }],
    projectWorld,
  );
  const sceneScale = fitScale(scene);
  return targets.map((target, index) => {
    const point = points[index];
    const area = bounds([target, { surfaces: [], lines: point ? [[point]] : [] }], projectWorld);
    const scale = Math.max(sceneScale, fitScale(area) * minimumTargetProportion);
    const frame = scale > sceneScale ? area : scene;
    const project = (p: Vector): Point => {
      const q = projectWorld(p);
      return {
        x: 72 + (q.x - (frame.left + frame.right) / 2) * scale,
        y: 52 + (q.y - (frame.top + frame.bottom) / 2) * scale,
      };
    };
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 144 104");
    svg.setAttribute("overflow", "hidden");
    svg.setAttribute("aria-hidden", "true");
    draw(svg, context, project, "#dbe1e8", "#aab5c1");
    draw(svg, target, project, "#8cbde8", "#1269b5");
    if (point) drawPoint(svg, point, project);
    return svg;
  });
}
function drawPoint(svg: SVGSVGElement, point: Vector, project: (p: Vector) => Point): void {
  const p = project(point),
    group = document.createElementNS(ns, "g");
  group.classList.add("overlap-point");
  group.dataset.point = JSON.stringify(point);
  group.setAttribute("transform", `translate(${p.x} ${p.y})`);
  group.innerHTML =
    '<circle r="6" fill="white" stroke="#1269b5" stroke-width="2"/><path d="M-4 0H4M0 -4V4" fill="none" stroke="#1269b5" stroke-width="1.5"/>';
  svg.append(group);
}
interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
function bounds(geometries: PreviewGeometry[], project: (p: Vector) => Point): Bounds {
  let left = Infinity,
    right = -Infinity,
    top = Infinity,
    bottom = -Infinity;
  for (const point of geometries.flatMap((g) => [...g.surfaces, ...g.lines]).flat()) {
    const p = project(point);
    left = Math.min(left, p.x);
    right = Math.max(right, p.x);
    top = Math.min(top, p.y);
    bottom = Math.max(bottom, p.y);
  }
  return Number.isFinite(left)
    ? { left, right, top, bottom }
    : { left: 0, right: 0, top: 0, bottom: 0 };
}
function fitScale(area: Bounds): number {
  const extent = Math.max(
    (area.right - area.left) / previewWidth,
    (area.bottom - area.top) / previewHeight,
  );
  return extent > 0 ? 1 / extent : 1;
}
function draw(
  svg: SVGSVGElement,
  geometry: PreviewGeometry,
  project: (p: Vector) => Point,
  fill: string,
  stroke: string,
): void {
  for (const [paths, closed] of [
    [geometry.surfaces, true],
    [geometry.lines, false],
  ] as const) {
    const path = document.createElementNS(ns, "path");
    path.setAttribute(
      "d",
      paths
        .map((points) => {
          const projected = points.map(project);
          // A solid's opposite triangle windings must not cancel its SVG silhouette.
          const area = projected.reduce((sum, p, i) => {
            const q = projected[(i + 1) % projected.length];
            return sum + p.x * q.y - q.x * p.y;
          }, 0);
          if (closed && area < 0) projected.reverse();
          return (
            projected
              .map((q, i) => `${i ? "L" : "M"}${q.x.toFixed(2)},${q.y.toFixed(2)}`)
              .join(" ") + (closed ? " Z" : "")
          );
        })
        .join(" "),
    );
    path.setAttribute("fill", closed ? fill : "none");
    path.setAttribute("stroke", closed ? "none" : stroke);
    path.setAttribute("stroke-width", "1.5");
    path.setAttribute("stroke-linejoin", "round");
    svg.append(path);
  }
}
