import { canonicalPlanes } from "../preferences/canonical-planes.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { Vector } from "../sketch/planes.js";
import { gridSpacing } from "../sketch/world-grid.js";
import type { GuideMoveCandidate } from "./move-target.js";

const ns = "http://www.w3.org/2000/svg";
/** Local, plane-aligned grid emphasis uses the same world spacing as the main grid. */
export function guidePlanePatches(
  editor: SketchEditor,
  candidates: GuideMoveCandidate[],
): SVGGElement {
  const root = document.createElementNS(ns, "g");
  const colors = canonicalPlanes().colors;
  const radius = (54 * editor.world.height) / editor.world.canvas.clientHeight;
  const spacing = gridSpacing(editor.world.height, editor.world.canvas.clientHeight);
  for (const candidate of candidates) {
    if (!candidate.plane || candidate.reference.kind !== "plane" || !candidate.reference.world)
      continue;
    const { frame, world } = candidate.reference;
    const point = candidate.point;
    const center = editor.world.project(point);
    const along = (axis: Vector) =>
      editor.world.project(point.map((v, i) => v + axis[i]) as Vector);
    const u = along(frame.u),
      v = along(frame.v);
    const patch = document.createElementNS(ns, "g");
    patch.classList.add("guide-plane-patch");
    patch.dataset.plane = world;
    patch.dataset.point = JSON.stringify(point);
    patch.setAttribute(
      "transform",
      `matrix(${u.x - center.x} ${u.y - center.y} ${v.x - center.x} ${v.y - center.y} ${center.x} ${center.y})`,
    );
    patch.setAttribute("color", colors[world]);
    const id = `guide-plane-patch-${world}`;
    patch.append(patchMask(id, radius));
    const grid = document.createElementNS(ns, "g");
    grid.setAttribute("mask", `url(#${id})`);
    const fill = document.createElementNS(ns, "circle");
    fill.setAttribute("r", String(radius));
    fill.setAttribute("fill", "currentColor");
    fill.setAttribute("opacity", "0.13");
    grid.append(fill);
    const local = [frame.u, frame.v].map((axis) =>
      point.reduce((sum, p, i) => sum + (p - frame.origin[i]) * axis[i], 0),
    );
    for (const [axis, coordinate] of local.entries())
      for (
        let index = Math.ceil((coordinate - radius) / spacing);
        index * spacing < coordinate + radius;
        index++
      ) {
        const offset = index * spacing - coordinate;
        const line = document.createElementNS(ns, "line");
        const ends =
          axis === 0 ? [offset, -radius, offset, radius] : [-radius, offset, radius, offset];
        for (const [i, key] of ["x1", "y1", "x2", "y2"].entries())
          line.setAttribute(key, String(ends[i]));
        line.setAttribute("vector-effect", "non-scaling-stroke");
        line.classList.add(index % 10 === 0 ? "major" : "minor");
        grid.append(line);
      }
    patch.append(grid);
    root.append(patch);
  }
  return root;
}

function patchMask(id: string, radius: number): SVGDefsElement {
  const defs = document.createElementNS(ns, "defs");
  defs.innerHTML = `<radialGradient id="${id}-fade"><stop offset="0" stop-color="white"/><stop offset="0.35" stop-color="white" stop-opacity="0.9"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient><mask id="${id}" maskUnits="userSpaceOnUse" x="${-radius}" y="${-radius}" width="${2 * radius}" height="${2 * radius}"><circle r="${radius}" style="fill:url(#${id}-fade);stroke:none"/></mask>`;
  return defs;
}
