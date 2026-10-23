import * as THREE from "three";
import type { SketchEditor } from "../sketch/editor.js";
import { planeCorners } from "../sketch/plane-bounds.js";
import { planePatch, positionPlanePatch } from "../sketch/plane-target-mesh.js";
import type { PlaneFrame } from "../sketch/planes.js";
import { planePatchGrid } from "./plane-patch-grid.js";

/** Saved planes use the same depth/stencil policy and adaptive patches as world planes. */
export class SavedPlaneView {
  private group = new THREE.Group();
  private key = "";
  constructor(private editor: SketchEditor) {
    editor.world.scene.add(this.group);
  }
  update(
    selected: string | null,
    hovered: string | null,
    accepts?: (frame: PlaneFrame) => boolean,
  ): void {
    const e = this.editor;
    const visible = (e.display.constructionPlanes ?? []).filter(
      (p) => !e.world.active && e.visibility.visible(p.id) && (!accepts || accepts(p.frame)),
    );
    const key = JSON.stringify([
      visible,
      visible.map((p) => e.world.planeBounds(p.frame)),
      selected,
      hovered,
      !!e.world.planePicker,
      e.world.spacing,
    ]);
    if (key === this.key) return;
    this.key = key;
    this.clear();
    for (const p of visible) {
      const active = p.id === selected || p.id === hovered;
      const bounds = e.world.planeBounds(p.frame),
        mesh = planePatch(active ? "#83b9ee" : "#648bab");
      mesh.material.opacity = active ? 0.35 : 0.12;
      mesh.material.stencilWrite = p.id !== selected && !e.world.planePicker;
      positionPlanePatch(mesh, p.frame, bounds);
      this.group.add(mesh, planePatchGrid(p.frame, bounds, e.world.spacing));
      const geometry = new THREE.BufferGeometry().setFromPoints(
        planeCorners(p.frame, bounds).map((v) => new THREE.Vector3(...v)),
      );
      const outline = new THREE.LineLoop(
        geometry,
        new THREE.LineBasicMaterial({ color: active ? "#1676d2" : "#648bab" }),
      );
      this.group.add(outline);
    }
  }
  private clear(): void {
    for (const child of this.group.children) {
      const item = child as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
      item.geometry.dispose();
      item.material.dispose();
    }
    this.group.clear();
  }
  dispose(): void {
    this.clear();
    this.editor.world.scene.remove(this.group);
  }
}
