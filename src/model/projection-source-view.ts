import * as THREE from "three";
import type { SketchEditor } from "../sketch/editor.js";
import type { ProjectionSource } from "./projection.js";
import { projectionLines, projectionTargets } from "./projection-selection.js";

/** Source fills use ordinary selection rendering; explicit curves also have persistent outlines. */
export class ProjectionSourceView {
  private group = new THREE.Group();
  private selected = new THREE.LineBasicMaterial({ color: "#a66a16", depthTest: false });
  private hovered = new THREE.LineBasicMaterial({ color: "#1676d2", depthTest: false });
  private key = "";
  constructor(private editor: SketchEditor) {
    editor.world.scene.add(this.group);
  }
  show(sources: readonly ProjectionSource[], hover: ProjectionSource | null): void {
    this.editor.modeling.targets = projectionTargets(this.editor, sources);
    this.editor.modeling.hover = hover
      ? (projectionTargets(this.editor, [hover])[0] ?? null)
      : null;
    const key = JSON.stringify([sources, hover, this.editor.world.height]);
    if (key === this.key) return;
    this.key = key;
    for (const child of this.group.children) (child as THREE.Line).geometry.dispose();
    this.group.clear();
    for (const [items, material] of [
      [sources, this.selected],
      [hover ? [hover] : [], this.hovered],
    ] as const)
      for (const points of projectionLines(this.editor, items)) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
        const line = new THREE.Line(geometry, material);
        line.renderOrder = 16;
        this.group.add(line);
      }
  }
  clear(): void {
    this.show([], null);
  }
  dispose(): void {
    for (const child of this.group.children) (child as THREE.Line).geometry.dispose();
    this.selected.dispose();
    this.hovered.dispose();
    this.editor.world.scene.remove(this.group);
  }
}
