import * as THREE from "three";
import type { PlaneFrame, Point } from "../sketch/planes.js";
import { worldPoint } from "../sketch/planes.js";
import type { World } from "../sketch/world.js";
import { primitivePreviewLayer } from "../sketch/world-primitive-overlay.js";
import type { cubeRectangle } from "./cube-rectangle.js";
import { primitivePreviewMesh } from "./primitive-preview-mesh.js";
import "./cube-preview.css";

/** Presentation-only rectangle and extrusion mesh; accepted geometry waits for release. */
export class CubePreview {
  private mesh = primitivePreviewMesh(new THREE.BoxGeometry(1, 1, 1));
  private solid = this.mesh.solid;
  private line = new THREE.LineLoop(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: "#28643a" }),
  );
  private labels = [document.createElement("span"), document.createElement("span")];
  constructor(
    private world: World,
    overlay: HTMLElement,
  ) {
    this.line.layers.set(primitivePreviewLayer);
    this.line.renderOrder = 100;
    this.line.visible = false;
    this.solid.visible = false;
    world.scene.add(this.line, this.solid);
    for (const label of this.labels) {
      label.className = "cube-dimension";
      label.hidden = true;
      overlay.append(label);
    }
  }
  show(plane: PlaneFrame, rectangle: ReturnType<typeof cubeRectangle>): void {
    const { a, b, width, height } = rectangle;
    const depth = Math.min(width, height);
    const u = new THREE.Vector3(...plane.u);
    const v = new THREE.Vector3(...plane.v);
    const normal = u.clone().cross(v);
    this.solid.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, normal));
    this.solid.position
      .set(...worldPoint(plane, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }))
      .addScaledVector(normal, rectangle.symmetric ? 0 : depth / 2);
    this.solid.scale.set(width, height, depth);
    this.solid.visible = depth > 0;
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
    this.solid.visible = false;
    for (const label of this.labels) label.hidden = true;
  }
  dispose(): void {
    this.world.scene.remove(this.line, this.solid);
    this.mesh.dispose();
    this.line.geometry.dispose();
    this.line.material.dispose();
    for (const label of this.labels) label.remove();
  }
}
