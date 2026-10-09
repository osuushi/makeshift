import * as THREE from "three";
import { type Vector, worldPoint } from "../sketch/planes.js";
import type { World } from "../sketch/world.js";
import type { CircularPlacement, CircularPrimitiveShape } from "./circular-primitive-controls.js";
import { primitivePreviewMesh } from "./primitive-preview-mesh.js";
import { sphereAxisDirection } from "./sphere-sketch.js";
import "./cube-preview.css";

/** Lightweight presentation only; all accepted geometry comes from ordinary tools. */
export class CircularPrimitivePreview {
  private mesh: ReturnType<typeof primitivePreviewMesh>;
  private solid: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>;
  private axis = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color: "#1675dc",
      transparent: true,
      opacity: 0.5,
      depthTest: false,
    }),
  );
  private circle = new THREE.LineLoop(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: "#28643a" }),
  );
  private label = document.createElement("span");
  constructor(
    private world: World,
    overlay: HTMLElement,
    private shape: CircularPrimitiveShape,
  ) {
    const geometry =
      shape === "sphere"
        ? new THREE.SphereGeometry(1, 32, 16)
        : new THREE.CylinderGeometry(shape === "cone" ? 0 : 1, 1, 2, 48);
    this.mesh = primitivePreviewMesh(geometry, shape === "drill" ? "#e8a6a6" : "#a6e8ae");
    this.solid = this.mesh.solid;
    this.axis.renderOrder = 100;
    this.circle.renderOrder = 100;
    this.label.className = "cube-dimension circular-primitive-dimension";
    overlay.append(this.label);
    world.scene.add(this.circle, this.axis, this.solid);
    this.hide();
  }
  show(placement: CircularPlacement): void {
    const { plane, center, radius } = placement;
    const u = new THREE.Vector3(...plane.u);
    const v = new THREE.Vector3(...plane.v);
    const normal = u.clone().cross(v);
    // Three's cylinders point along Y; align that axis with the support normal.
    this.solid.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(u, normal, v.clone().negate()),
    );
    this.solid.position.set(...worldPoint(plane, center));
    const drillDepth = placement.depth ?? radius * 2;
    const offset = this.shape === "drill" ? -drillDepth / 2 : radius;
    if (this.shape !== "sphere") this.solid.position.addScaledVector(normal, offset);
    this.solid.scale.set(radius, this.shape === "drill" ? drillDepth / 2 : radius, radius);
    this.solid.visible = radius > 0;
    this.showAxis(placement);
    const points = Array.from({ length: 64 }, (_, i) => {
      const angle = (i * 2 * Math.PI) / 64;
      return new THREE.Vector3(
        ...worldPoint(plane, {
          x: center.x + radius * Math.cos(angle),
          y: center.y + radius * Math.sin(angle),
        }),
      );
    });
    this.circle.geometry.dispose();
    this.circle.geometry = new THREE.BufferGeometry().setFromPoints(points);
    this.circle.visible = true;
    const screen = this.world.projectLocal(plane, { x: center.x + radius, y: center.y });
    const bounds = this.label.parentElement?.getBoundingClientRect();
    this.label.textContent = `Ø ${Number((radius * 2).toPrecision(4))} mm`;
    this.label.style.left = `${screen.x - (bounds?.left ?? 0)}px`;
    this.label.style.top = `${screen.y - (bounds?.top ?? 0)}px`;
    this.label.hidden = false;
  }
  private showAxis({ plane, center, radius }: CircularPlacement): void {
    this.axis.visible = this.shape === "sphere";
    if (!this.axis.visible) return;
    const view = this.world.target.clone().sub(this.world.camera.position).normalize();
    const direction = sphereAxisDirection(plane, view.toArray() as Vector);
    this.axis.geometry.dispose();
    this.axis.geometry = new THREE.BufferGeometry().setFromPoints(
      [-1, 1].map(
        (sign) =>
          new THREE.Vector3(
            ...worldPoint(plane, {
              x: center.x + sign * radius * direction.x,
              y: center.y + sign * radius * direction.y,
            }),
          ),
      ),
    );
  }
  hide(): void {
    this.axis.visible = false;
    this.circle.visible = false;
    this.solid.visible = false;
    this.label.hidden = true;
  }
  dispose(): void {
    this.world.scene.remove(this.circle, this.axis, this.solid);
    this.axis.geometry.dispose();
    this.axis.material.dispose();
    this.mesh.dispose();
    this.circle.geometry.dispose();
    this.circle.material.dispose();
    this.label.remove();
  }
}
