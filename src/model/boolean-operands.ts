import * as THREE from "three";
import type { SketchEditor } from "../sketch/editor.js";
import type { BodyBoolean, BodyGeometry } from "./body.js";
import { featureEdges } from "./feature-edges.js";

/** Temporary translucent operand surfaces and outlines remain visible even when a preview consumes them. */
export class BooleanOperands {
  private group = new THREE.Group();
  constructor(private editor: SketchEditor) {
    editor.world.scene.add(this.group);
  }
  show(bodies: readonly BodyGeometry[], mode: BodyBoolean["mode"], target: string | null): void {
    this.clear();
    bodies.forEach((body) => {
      const color = mode === "subtract" && body.id !== target ? "#d08a35" : "#287cbd";
      for (const face of body.faces) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(face.vertices, 3));
        const material = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.16,
          depthTest: false,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.booleanOperand = {
          body: body.id,
          role: mode === "subtract" ? (body.id !== target ? "tool" : "target") : "input",
        };
        mesh.renderOrder = 8;
        this.group.add(mesh);
      }
      for (const edge of featureEdges(body)) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(edge.points, 3));
        const material = new THREE.LineBasicMaterial({
          color,
          depthTest: false,
          depthWrite: false,
          transparent: true,
          opacity: 0.7,
        });
        const line = new THREE.Line(geometry, material);
        line.renderOrder = 10;
        this.group.add(line);
      }
    });
  }
  /** Show the generated operand corresponding to the just-displayed sweep candidate. */
  showTool(): void {
    const mode = this.editor.store.booleanMode;
    if (mode === "subtract" || mode === "intersect")
      this.show(this.editor.store.booleanTools, mode, null);
    else this.clear();
  }
  clear(): void {
    for (const object of [...this.group.children]) {
      const drawable = object as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
      drawable.geometry.dispose();
      drawable.material.dispose();
      this.group.remove(drawable);
    }
  }
  dispose(): void {
    this.clear();
    this.editor.world.scene.remove(this.group);
  }
}
