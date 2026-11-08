import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { OverlapTarget } from "./overlap-candidates.js";
import { overlapGeometry } from "./overlap-geometry.js";

export class OverlapHighlight {
  private readonly scene = new THREE.Scene();
  constructor(private editor: SketchEditor) {
    editor.world.renderInteractionOverlays.add(this.render);
  }
  private render = (): void => {
    if (!this.scene.children.length) return;
    const { renderer, camera } = this.editor.world;
    const autoClear = renderer.autoClear;
    const clippingPlanes = renderer.clippingPlanes;
    try {
      renderer.autoClear = false;
      renderer.clippingPlanes = [];
      renderer.render(this.scene, camera);
    } finally {
      renderer.autoClear = autoClear;
      renderer.clippingPlanes = clippingPlanes;
    }
  };
  show(target: OverlapTarget | null): void {
    this.clear();
    if (target) {
      const geometry = overlapGeometry(this.editor, target);
      const vertices = geometry.surfaces.flatMap((p) =>
        p.slice(1, -1).flatMap((_, i) => [p[0], p[i + 1], p[i + 2]].flat()),
      );
      if (vertices.length) {
        const mesh = new THREE.Mesh(
          new THREE.BufferGeometry().setAttribute(
            "position",
            new THREE.Float32BufferAttribute(vertices, 3),
          ),
          new THREE.MeshBasicMaterial({
            color: "#e9a134",
            opacity: 0.38,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        );
        mesh.renderOrder = 90;
        this.scene.add(mesh);
      }
      for (const points of geometry.lines) {
        const line = new Line2(
          new LineGeometry().setPositions(points.flat()),
          new LineMaterial({ color: "#d17c12", linewidth: 4, depthTest: false, depthWrite: false }),
        );
        line.renderOrder = 91;
        this.scene.add(line);
      }
    }
    this.editor.world.requestDraw();
  }
  private clear(): void {
    for (const object of [...this.scene.children]) {
      const mesh = object as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
      mesh.geometry.dispose();
      mesh.material.dispose();
      this.scene.remove(mesh);
    }
  }
  dispose(): void {
    this.clear();
    this.editor.world.renderInteractionOverlays.delete(this.render);
  }
}
