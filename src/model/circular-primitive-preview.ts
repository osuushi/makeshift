import * as THREE from "three";
import { worldPoint } from "../sketch/planes.js";
import type { World } from "../sketch/world.js";
import type { CircularPlacement, CircularPrimitiveShape } from "./circular-primitive-controls.js";
import "./cube-preview.css";

/** Lightweight presentation only; all accepted geometry comes from ordinary tools. */
export class CircularPrimitivePreview {
  private solid: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private circle = new THREE.LineLoop(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: "#1675dc", depthTest: false }),
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
    this.solid = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: shape === "drill" ? "#e8a6a6" : "#a6e8ae",
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
    );
    this.circle.renderOrder = 100;
    this.label.className = "cube-dimension circular-primitive-dimension";
    overlay.append(this.label);
    world.scene.add(this.circle, this.solid);
    this.hide();
  }
  show(placement: CircularPlacement): void {
    const { plane, center, radius, symmetric } = placement;
    const u = new THREE.Vector3(...plane.u);
    const v = new THREE.Vector3(...plane.v);
    const normal = u.clone().cross(v);
    // Three's cylinders point along Y; align that axis with the support normal.
    this.solid.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(u, normal, v.clone().negate()),
    );
    this.solid.position.set(...worldPoint(plane, center));
    if (this.shape !== "sphere")
      this.solid.position.addScaledVector(
        normal,
        symmetric ? 0 : this.shape === "drill" ? -radius : radius,
      );
    this.solid.scale.setScalar(radius);
    this.solid.visible = radius > 0;
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
  hide(): void {
    this.circle.visible = false;
    this.solid.visible = false;
    this.label.hidden = true;
  }
  dispose(): void {
    this.world.scene.remove(this.circle, this.solid);
    this.solid.geometry.dispose();
    this.solid.material.dispose();
    this.circle.geometry.dispose();
    this.circle.material.dispose();
    this.label.remove();
  }
}
