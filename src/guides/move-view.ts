import * as THREE from "three";
import type { SketchEditor } from "../sketch/editor.js";
import type { Point, Vector } from "../sketch/planes.js";
import type { GuideMoveTarget } from "./move-target.js";

/** Screen-sized arrow whose tail stays at the original guide, never at the cursor. */
export class GuideMoveView {
  private root = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  private line: SVGLineElement;
  private start: SVGCircleElement;
  private end: SVGCircleElement;
  private label: SVGTextElement;
  private plane = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial({
      color: "#8b5cf6",
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    }),
  );
  constructor(
    private editor: SketchEditor,
    host: HTMLElement,
  ) {
    this.root.classList.add("guide-move-vector");
    this.root.innerHTML =
      '<defs><marker id="guide-move-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="12" markerHeight="12" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z"/></marker></defs><line marker-end="url(#guide-move-arrow)"/><circle class="start" r="4"/><circle class="end" r="7"/><text/>';
    this.line = this.root.querySelector("line") as SVGLineElement;
    this.start = this.root.querySelector(".start") as SVGCircleElement;
    this.end = this.root.querySelector(".end") as SVGCircleElement;
    this.label = this.root.querySelector("text") as SVGTextElement;
    host.append(this.root);
    this.plane.renderOrder = 39;
    editor.world.scene.add(this.plane);
    this.hide();
  }
  show(origin: Vector, target: GuideMoveTarget | null, cursor?: Point): void {
    const a = this.editor.world.project(origin),
      b = target ? this.editor.world.project(target.point) : (cursor ?? a);
    this.root.style.display = "block";
    this.root.classList.toggle("unsnapped", !target);
    this.root.dataset.start = JSON.stringify(origin);
    this.root.dataset.end = target ? JSON.stringify(target.point) : "";
    this.root.dataset.target = target?.label ?? "";
    this.start.setAttribute("cx", String(a.x));
    this.start.setAttribute("cy", String(a.y));
    this.line.style.display = "";
    this.end.style.display = target ? "" : "none";
    for (const [key, value] of Object.entries({ x1: a.x, y1: a.y, x2: b.x, y2: b.y }))
      this.line.setAttribute(key, String(value));
    this.end.setAttribute("cx", String(b.x));
    this.end.setAttribute("cy", String(b.y));
    this.label.setAttribute("x", String((a.x + b.x) / 2 + 12));
    this.label.setAttribute("y", String((a.y + b.y) / 2 - 12));
    const distance = target ? Math.hypot(...target.point.map((v, i) => v - origin[i])) : 0;
    this.label.textContent = target
      ? `${target.label} · ${Number(distance.toFixed(3))} mm`
      : "Snap to a point or plane";
    this.plane.geometry.dispose();
    this.plane.geometry = new THREE.BufferGeometry();
    this.plane.visible = !!target?.plane;
    if (target?.plane)
      this.plane.geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(target.plane.vertices, 3),
      );
    this.editor.world.draw();
  }
  hide(): void {
    this.root.style.display = "none";
    this.plane.visible = false;
  }
  dispose(): void {
    this.root.remove();
    this.editor.world.scene.remove(this.plane);
    this.plane.geometry.dispose();
    this.plane.material.dispose();
  }
}
