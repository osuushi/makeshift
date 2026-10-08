import type { SketchEditor } from "./editor.js";
import type { PenAnchor } from "./pen-geometry.js";
import type { PlaneFrame } from "./planes.js";

const ns = "http://www.w3.org/2000/svg";
export function drawPen(
  root: SVGSVGElement,
  editor: SketchEditor,
  plane: PlaneFrame | undefined,
  anchors: (PenAnchor | null)[],
): void {
  root.replaceChildren();
  if (!plane || editor.tool !== "pen" || !editor.world.active) return;
  const bounds = editor.world.canvas.getBoundingClientRect();
  const project = (point: PenAnchor["point"]) => {
    const p = editor.world.projectLocal(plane, point);
    return { x: p.x - bounds.left, y: p.y - bounds.top };
  };
  for (const anchor of anchors) {
    if (!anchor) continue;
    const a = project(anchor.point);
    for (const point of [anchor.incoming, anchor.outgoing]) {
      if (!point) continue;
      const b = project(point);
      const line = document.createElementNS(ns, "line");
      for (const [key, value] of Object.entries({ x1: a.x, y1: a.y, x2: b.x, y2: b.y }))
        line.setAttribute(key, String(value));
      line.setAttribute("stroke", "#337ac4");
      root.append(line);
      const handle = document.createElementNS(ns, "circle");
      handle.setAttribute("cx", String(b.x));
      handle.setAttribute("cy", String(b.y));
      handle.setAttribute("r", "4");
      handle.classList.add("edit-handle");
      root.append(handle);
    }
    const node = document.createElementNS(ns, "rect");
    for (const [key, value] of Object.entries({ x: a.x - 3, y: a.y - 3, width: 6, height: 6 }))
      node.setAttribute(key, String(value));
    node.classList.add("edit-handle");
    root.append(node);
  }
}
