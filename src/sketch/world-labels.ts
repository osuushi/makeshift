import { installModalPlaneWidgets } from "./modal-plane-widgets.js";
import { installPlaneTargets } from "./plane-targets.js";
import type { Point, Vector } from "./planes.js";
import type { World } from "./world.js";

export function worldLabels(
  world: World,
  overlay: HTMLElement,
  occupied: (point: Point, depth: number) => boolean = () => false,
  onHover: () => void = () => {},
) {
  const origin = document.createElement("div");
  origin.className = "origin";
  origin.textContent = "⊕ 0, 0, 0";
  overlay.append(origin);
  const disposeTargets = installPlaneTargets(world, overlay, occupied, onHover),
    disposeWidgets = installModalPlaneWidgets(world, overlay),
    axes = (["X", "Y", "Z"] as const).map((axis, i) => {
      const label = document.createElement("span");
      label.className = `axis axis-${axis}`;
      label.textContent = axis;
      overlay.append(label);
      const point: Vector = [0, 0, 0];
      point[i] = 18;
      return { label, point };
    });
  const update = () => {
    const rect = world.canvas.getBoundingClientRect(),
      projectedOrigin = world.project([0, 0, 0]);
    placeOrigin(origin, rect, projectedOrigin);
    for (const { label, point } of axes) {
      const p = world.project(point);
      label.hidden = Math.hypot(p.x - projectedOrigin.x, p.y - projectedOrigin.y) < 15;
      label.style.left = `${p.x - rect.left}px`;
      label.style.top = `${p.y - rect.top}px`;
    }
  };
  world.changed.add(update);
  update();
  return () => {
    world.changed.delete(update);
    disposeTargets();
    disposeWidgets();
    origin.remove();
    for (const { label } of axes) label.remove();
  };
}

function placeOrigin(origin: HTMLElement, rect: DOMRect, projected: Point): void {
  const x = Math.min(rect.width - 90, Math.max(25, projected.x - rect.left)),
    y = Math.min(rect.height - 50, Math.max(70, projected.y - rect.top)),
    outside =
      projected.x < rect.left + 25 ||
      projected.x > rect.right - 90 ||
      projected.y < rect.top + 70 ||
      projected.y > rect.bottom - 50,
    angle = Math.atan2(
      projected.y - (rect.top + rect.height / 2),
      projected.x - (rect.left + rect.width / 2),
    ),
    arrows = ["→", "↘", "↓", "↙", "←", "↖", "↑", "↗"];
  origin.style.left = `${x}px`;
  origin.style.top = `${y}px`;
  origin.textContent = outside
    ? `${arrows[(Math.round(angle / (Math.PI / 4)) + 8) % 8]} Origin · 0, 0, 0`
    : "⊕ 0, 0, 0";
}
