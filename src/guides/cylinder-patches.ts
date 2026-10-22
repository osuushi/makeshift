import * as THREE from "three";
import type { SketchEditor } from "../sketch/editor.js";
import type { Vector } from "../sketch/planes.js";
import { gridSpacing } from "../sketch/world-grid.js";
import type { GuideMoveCandidate } from "./move-target.js";

const ns = "http://www.w3.org/2000/svg";

/** A soft grid follows the solved cylinder between the reference and virtual handle. */
export function guideCylinderPatches(editor: SketchEditor, parents: readonly GuideMoveCandidate[]) {
  const root = document.createElementNS(ns, "g");
  for (const [index, parent] of parents.entries()) {
    const cylinder = parent.alignment?.cylinder;
    if (!cylinder || !parent.alignment) continue;
    const center = new THREE.Vector3(...cylinder.origin),
      axis = new THREE.Vector3(...cylinder.axis);
    const delta = new THREE.Vector3(...parent.point).sub(center);
    const height = delta.dot(axis);
    const radial = delta.clone().addScaledVector(axis, -height);
    const radius = radial.length();
    radial.normalize();
    const tangent = axis.clone().cross(radial);
    const reference = new THREE.Vector3(...parent.alignment.point).sub(center);
    const angle = Math.atan2(reference.dot(tangent), reference.dot(radial));
    const startHeight = reference.dot(axis);
    const screen = (a: number, z: number) =>
      editor.world.project(
        center
          .clone()
          .addScaledVector(axis, z)
          .addScaledVector(radial, radius * Math.cos(a))
          .addScaledVector(tangent, radius * Math.sin(a))
          .toArray() as Vector,
      );
    const path = (a: number, z: number, b: number, w: number) =>
      Array.from({ length: 33 }, (_, i) => {
        const p = screen(a + ((b - a) * i) / 32, z + ((w - z) * i) / 32);
        return `${i ? "L" : "M"}${p.x},${p.y}`;
      }).join(" ");
    const patch = document.createElementNS(ns, "g"),
      defs = document.createElementNS(ns, "defs");
    const id = `guide-cylinder-${index}`;
    patch.classList.add("guide-cylinder-patch");
    patch.dataset.destination = JSON.stringify(parent.point);
    defs.innerHTML = `<filter id="${id}-blur"><feGaussianBlur stdDeviation="7"/></filter><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${innerWidth}" height="${innerHeight}"><path class="guide-grid-reveal" pathLength="1" d="${path(angle, startHeight, 0, height)}" fill="none" stroke="white" stroke-width="38" stroke-linecap="round" filter="url(#${id}-blur)"/></mask>`;
    patch.append(defs);
    const grid = document.createElementNS(ns, "g");
    grid.setAttribute("mask", `url(#${id})`);
    grid.setAttribute("stroke", "#8b5cf6");
    grid.setAttribute("fill", "none");
    const width = (54 * editor.world.height) / editor.world.canvas.clientHeight;
    const spacing = gridSpacing(editor.world.height, editor.world.canvas.clientHeight);
    const low = Math.min(startHeight, height) - width,
      high = Math.max(startHeight, height) + width;
    const left = Math.min(0, angle) - width / radius,
      right = Math.max(0, angle) + width / radius;
    const add = (d: string) => {
      const line = document.createElementNS(ns, "path");
      line.setAttribute("d", d);
      line.setAttribute("opacity", "0.35");
      grid.append(line);
    };
    for (let z = Math.ceil(low / spacing) * spacing; z < high; z += spacing)
      add(path(left, z, right, z));
    for (
      let a = (Math.ceil((left * radius) / spacing) * spacing) / radius;
      a < right;
      a += spacing / radius
    )
      add(path(a, low, a, high));
    patch.append(grid);
    root.append(patch);
  }
  return root;
}
