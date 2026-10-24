import * as THREE from "three";
import type { SketchEditor } from "../sketch/editor.js";
import type { SelectionCandidate } from "./selection-candidates.js";
import type { ToolSelection } from "./tool-selection.js";

/** Temporary candidate ink is separate from accepted geometry and selected intent. */
export class SelectionEmphasis {
  private group = new THREE.Group();
  constructor(
    private editor: SketchEditor,
    candidates: SelectionCandidate[],
    private selection: ToolSelection,
  ) {
    for (const candidate of candidates) {
      const key = selection.key(candidate.target);
      const vertices = candidate.surfaces.flatMap((polygon) =>
        polygon.slice(1, -1).flatMap((_, i) => [polygon[0], polygon[i + 1], polygon[i + 2]].flat()),
      );
      if (vertices.length) {
        const mesh = new THREE.Mesh(
          new THREE.BufferGeometry().setAttribute(
            "position",
            new THREE.Float32BufferAttribute(vertices, 3),
          ),
          new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0.12,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
            side: THREE.DoubleSide,
          }),
        );
        mesh.userData.selectionKey = key;
        mesh.renderOrder = 19;
        this.group.add(mesh);
      }
      for (const points of candidate.lines) {
        const geometry = new THREE.BufferGeometry().setAttribute(
          "position",
          new THREE.Float32BufferAttribute(points.flat(), 3),
        );
        const object =
          points.length === 1
            ? new THREE.Points(geometry, new THREE.PointsMaterial({ size: 10, depthTest: false }))
            : new THREE.Line(
                geometry,
                new THREE.LineBasicMaterial({ depthTest: true, transparent: true, opacity: 0.65 }),
              );
        object.userData.selectionKey = key;
        object.renderOrder = 20;
        this.group.add(object);
      }
    }
    editor.world.scene.add(this.group);
    this.update();
  }
  update(): void {
    const keys = new Set(this.selection.targets.map((t) => this.selection.key(t)));
    for (const child of this.group.children) {
      const object = child as THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
      object.material.color.set(keys.has(object.userData.selectionKey) ? "#1678d2" : "#a66a16");
    }
  }
  dispose(): void {
    for (const child of this.group.children) {
      const object = child as THREE.Line<THREE.BufferGeometry, THREE.Material>;
      object.geometry.dispose();
      object.material.dispose();
    }
    this.editor.world.scene.remove(this.group);
  }
}
