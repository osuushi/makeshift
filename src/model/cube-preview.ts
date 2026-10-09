import * as THREE from "three";
import type { PlaneFrame, Point } from "../sketch/planes.js";
import { worldPoint } from "../sketch/planes.js";
import type { World } from "../sketch/world.js";
import type { cubeRectangle } from "./cube-rectangle.js";
import "./cube-preview.css";

/** A presentation-only rectangle; document geometry is created on release. */
export class CubePreview {
  private line = new THREE.LineLoop(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: "#1675dc", depthTest: false }),
  );
  private labels = [document.createElement("span"), document.createElement("span")];
  constructor(
    private world: World,
    overlay: HTMLElement,
  ) {
    this.line.renderOrder = 100;
    this.line.visible = false;
    world.scene.add(this.line);
    for (const label of this.labels) {
      label.className = "cube-dimension";
      label.hidden = true;
      overlay.append(label);
    }
  }
  show(plane: PlaneFrame, rectangle: ReturnType<typeof cubeRectangle>): void {
    const { a, b, width, height } = rectangle;
    const corners = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
    this.line.geometry.dispose();
    this.line.geometry = new THREE.BufferGeometry().setFromPoints(
      corners.map((p) => new THREE.Vector3(...worldPoint(plane, p))),
    );
    this.line.visible = true;
    const centers: Point[] = [
      { x: (a.x + b.x) / 2, y: a.y },
      { x: b.x, y: (a.y + b.y) / 2 },
    ];
    this.labels.forEach((label, i) => {
      const p = this.world.projectLocal(plane, centers[i]);
      const bounds = label.parentElement?.getBoundingClientRect();
      label.textContent = `${Number((i === 0 ? width : height).toPrecision(4))} mm`;
      label.style.left = `${p.x - (bounds?.left ?? 0)}px`;
      label.style.top = `${p.y - (bounds?.top ?? 0)}px`;
      label.hidden = false;
    });
  }
  hide(): void {
    this.line.visible = false;
    for (const label of this.labels) label.hidden = true;
  }
  dispose(): void {
    this.world.scene.remove(this.line);
    this.line.geometry.dispose();
    this.line.material.dispose();
    for (const label of this.labels) label.remove();
  }
}
