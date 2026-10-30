import * as THREE from "three";
import { canonicalPlanes } from "../preferences/canonical-planes.js";
import type { SketchEditor } from "../sketch/editor.js";
import { planePatchFillOpacity, planePatchMask } from "../sketch/plane-patch-style.js";
import type { PlaneFrame, Vector } from "../sketch/planes.js";
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
  for (const candidate of candidates) {
    if (!candidate.plane || candidate.reference.kind !== "plane" || !candidate.reference.world)
      continue;
    const { frame, world } = candidate.reference;
    const patch = gridPatch(
      editor,
      frame,
      candidate.point,
      `guide-plane-patch-${world}`,
      colors[world],
    );
    patch.dataset.plane = world;
    patch.dataset.point = JSON.stringify(candidate.point);
    root.append(patch);
  }
  return root;
}

/** A lock reveals a narrow in-plane bridge from actual face geometry to the destination. */
export function guideFacePlanePatches(
  editor: SketchEditor,
  parents: readonly GuideMoveCandidate[],
): SVGGElement {
  const root = document.createElementNS(ns, "g");
  root.classList.add("guide-face-plane-patches");
  for (const [index, parent] of parents.entries()) {
    if (!parent.plane || (!parent.alignment && parent.reference.kind !== "face")) continue;
    const reference = parent.reference;
    const face =
      reference.kind === "face"
        ? editor.store.data.bodies
            ?.find((b) => b.id === reference.body)
            ?.faces.find((f) => f.id === reference.face)
        : null;
    if (!parent.alignment && !face?.vertices.length) continue;
    const source = parent.alignment?.point ?? nearestFacePoint(face?.vertices ?? [], parent.point);
    const patch = gridPatch(
      editor,
      parent.plane.frame,
      source,
      `guide-face-plane-${index}`,
      "#8b5cf6",
      parent.point,
    );
    patch.classList.add("guide-face-plane-patch");
    patch.dataset.source = JSON.stringify(source);
    patch.dataset.destination = JSON.stringify(parent.point);
    root.append(patch);
  }
  return root;
}

function nearestFacePoint(vertices: readonly number[], point: Vector): Vector {
  const triangle = new THREE.Triangle(),
    query = new THREE.Vector3(...point),
    nearest = new THREE.Vector3();
  const result = new THREE.Vector3();
  let distance = Infinity;
  for (let i = 0; i < vertices.length; i += 9) {
    triangle.a.fromArray(vertices, i);
    triangle.b.fromArray(vertices, i + 3);
    triangle.c.fromArray(vertices, i + 6);
    triangle.closestPointToPoint(query, nearest);
    const d = nearest.distanceToSquared(query);
    if (d < distance) {
      distance = d;
      result.copy(nearest);
    }
  }
  return result.toArray() as Vector;
}

function gridPatch(
  editor: SketchEditor,
  frame: PlaneFrame,
  point: Vector,
  id: string,
  color: string,
  end?: Vector,
): SVGGElement {
  const radius = ((end ? 38 : 54) * editor.world.height) / editor.world.canvas.clientHeight;
  const spacing = gridSpacing(editor.world.height, editor.world.canvas.clientHeight);
  const center = editor.world.project(point);
  const along = (axis: Vector) => editor.world.project(point.map((v, i) => v + axis[i]) as Vector);
  const u = along(frame.u),
    v = along(frame.v);
  const patch = document.createElementNS(ns, "g");
  patch.classList.add("guide-plane-patch");
  patch.dataset.point = JSON.stringify(point);
  patch.setAttribute(
    "transform",
    `matrix(${u.x - center.x} ${u.y - center.y} ${v.x - center.x} ${v.y - center.y} ${center.x} ${center.y})`,
  );
  patch.setAttribute("color", color);
  const finish = [frame.u, frame.v].map((axis) =>
    axis.reduce((sum, v, i) => sum + v * ((end?.[i] ?? point[i]) - point[i]), 0),
  );
  const bounds = {
    left: Math.min(0, finish[0]) - radius,
    right: Math.max(0, finish[0]) + radius,
    top: Math.min(0, finish[1]) - radius,
    bottom: Math.max(0, finish[1]) + radius,
  };
  patch.append(end ? strokeMask(id, radius, finish, bounds) : patchMask(id, radius));
  const grid = document.createElementNS(ns, "g");
  grid.setAttribute("mask", `url(#${id})`);
  const fill = document.createElementNS(ns, "rect");
  fill.setAttribute("x", String(bounds.left));
  fill.setAttribute("y", String(bounds.top));
  fill.setAttribute("width", String(bounds.right - bounds.left));
  fill.setAttribute("height", String(bounds.bottom - bounds.top));
  fill.setAttribute("fill", "currentColor");
  fill.setAttribute("opacity", String(planePatchFillOpacity));
  grid.append(fill);
  const local = [frame.u, frame.v].map((axis) =>
    point.reduce((sum, p, i) => sum + (p - frame.origin[i]) * axis[i], 0),
  );
  for (const [axis, coordinate] of local.entries()) {
    const min = axis === 0 ? bounds.left : bounds.top,
      max = axis === 0 ? bounds.right : bounds.bottom;
    for (
      let index = Math.ceil((coordinate + min) / spacing);
      index * spacing < coordinate + max;
      index++
    ) {
      const offset = index * spacing - coordinate;
      const line = document.createElementNS(ns, "line");
      const ends =
        axis === 0
          ? [offset, bounds.top, offset, bounds.bottom]
          : [bounds.left, offset, bounds.right, offset];
      for (const [i, key] of ["x1", "y1", "x2", "y2"].entries())
        line.setAttribute(key, String(ends[i]));
      line.setAttribute("vector-effect", "non-scaling-stroke");
      line.classList.add(index % 10 === 0 ? "major" : "minor");
      grid.append(line);
    }
  }
  patch.append(grid);
  return patch;
}

function strokeMask(
  id: string,
  radius: number,
  end: number[],
  bounds: { left: number; top: number; right: number; bottom: number },
): SVGDefsElement {
  const defs = document.createElementNS(ns, "defs");
  const length = Math.hypot(...end);
  const stroke =
    length > 1e-8
      ? `<line class="guide-grid-reveal" x1="0" y1="0" x2="${end[0]}" y2="${end[1]}" pathLength="1" style="stroke:white;stroke-width:${radius};stroke-linecap:round;opacity:1"/>`
      : `<circle r="${radius / 2}" style="fill:white;stroke:none"/>`;
  defs.innerHTML = `<filter id="${id}-blur" x="${bounds.left}" y="${bounds.top}" width="${bounds.right - bounds.left}" height="${bounds.bottom - bounds.top}" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="${radius / 5}"/></filter><mask id="${id}" maskUnits="userSpaceOnUse" x="${bounds.left}" y="${bounds.top}" width="${bounds.right - bounds.left}" height="${bounds.bottom - bounds.top}"><g filter="url(#${id}-blur)">${stroke}</g></mask>`;
  return defs;
}

function patchMask(id: string, radius: number): SVGDefsElement {
  const defs = document.createElementNS(ns, "defs");
  defs.innerHTML = planePatchMask(id, radius);
  return defs;
}
