import { placeFloatingPanel } from "../preferences/panel-placement.js";
import { displayPoints } from "./curve-geometry.js";
import type { SketchEditor } from "./editor.js";
import type { Point } from "./planes.js";

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
const intersects = (a: Box, b: Box) =>
  a.left < b.right + 5 && a.right > b.left - 5 && a.top < b.bottom + 5 && a.bottom > b.top - 5;

// Presentation only: keep local controls clear of drawable edges and each other.
// Every refresh starts from their geometry-relative anchors, so no layout state
// becomes part of the document or accumulates through a drag.
export function layoutLocalControls(editor: SketchEditor, overlay: HTMLElement): void {
  const sketch = editor.sketch;
  if (!sketch) return;
  const viewport = editor.world.canvas.getBoundingClientRect();
  const points: Point[] = [];
  for (const curve of sketch.curves) {
    const vertices = displayPoints(curve, editor.world.height / viewport.height).map((p) =>
      editor.world.projectLocal(sketch.plane, p),
    );
    for (let i = 1; i < vertices.length; i++) {
      const a = vertices[i - 1],
        b = vertices[i];
      const count = Math.min(256, Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 8)));
      for (let j = 0; j <= count; j++)
        points.push({
          x: a.x + ((b.x - a.x) * j) / count,
          y: a.y + ((b.y - a.y) * j) / count,
        });
    }
  }
  const occupied: Box[] = [
    ...overlay.querySelectorAll(
      ".rotation-handle, .transform-ring, polygon.transform-axis, .bow-handle, .fillet-guide-hit, .edit-handle, .center-handle, .constraint-list:not([hidden]), .point-chooser:not([hidden]), .overlap-chooser:not([hidden])",
    ),
  ].map((node) => node.getBoundingClientRect());
  const controls = [
    ...overlay.querySelectorAll<HTMLElement>(
      ".pivot-control, .move-control, .offset-control, .fillet-control, .dimension",
    ),
  ];
  // Preserve dimension anchors before placing the optional modification action.
  controls.sort(
    (a, b) =>
      Number(a.matches(".offset-control, .fillet-control, .move-control")) -
      Number(b.matches(".offset-control, .fillet-control, .move-control")),
  );
  for (const control of controls) {
    if (control.hidden || !control.getClientRects().length) continue;
    if (placeFloatingPanel(control)) {
      occupied.push(control.getBoundingClientRect());
      continue;
    }
    const initial = control.getBoundingClientRect();
    let best = { dx: 0, dy: 0, score: Number.POSITIVE_INFINITY, box: initial as Box };
    for (const dx of [0, -36, 36, -72, 72, -108, 108, -144, 144]) {
      for (const dy of [0, -36, 36, -72, 72, -108, 108, -144, 144]) {
        const box = {
          left: initial.left + dx,
          right: initial.right + dx,
          top: initial.top + dy,
          bottom: initial.bottom + dy,
        };
        if (
          box.left < viewport.left + 8 ||
          box.right > viewport.right - 8 ||
          box.top < viewport.top + 65 ||
          box.bottom > viewport.bottom - 55
        )
          continue;
        const clashes = occupied.filter((other) => intersects(box, other)).length;
        const covered = points.filter(
          (p) =>
            p.x > box.left - 7 && p.x < box.right + 7 && p.y > box.top - 7 && p.y < box.bottom + 7,
        ).length;
        const score = clashes * 100000 + covered * 1000 + Math.hypot(dx, dy);
        if (score < best.score) best = { dx, dy, score, box };
      }
    }
    control.style.left = `${Number.parseFloat(control.style.left) + best.dx}px`;
    control.style.top = `${Number.parseFloat(control.style.top) + best.dy}px`;
    occupied.push(best.box);
  }
}
