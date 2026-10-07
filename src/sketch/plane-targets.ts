import * as THREE from "three";
import { viewDisplay } from "../preferences/view-display.js";
import { canonicalPlaneBounds, canonicalPlaneSelectable } from "./canonical-plane-bounds.js";
import {
  createPlaneTargets,
  disposePlaneTarget,
  type PlaneTarget,
  planeTargetBaseColor,
  positionPlanePatch,
} from "./plane-target-mesh.js";
import type { Point } from "./planes.js";
import type { World } from "./world.js";

export function installPlaneTargets(
  world: World,
  _overlay: HTMLElement,
  occupied: (point: Point, depth: number) => boolean,
  onHover: () => void,
): () => void {
  const targets = createPlaneTargets(world);
  const interaction = new PlaneTargetInteraction(world, targets, occupied, onHover);
  world.changed.add(interaction.update);
  interaction.update();
  return () => {
    world.changed.delete(interaction.update);
    interaction.dispose();
    for (const target of targets) disposePlaneTarget(world, target);
  };
}
class PlaneTargetInteraction {
  private raycaster = new THREE.Raycaster();
  private abort = new AbortController();
  private hovered: PlaneTarget | null = null;
  constructor(
    private world: World,
    private targets: PlaneTarget[],
    private occupied: (point: Point, depth: number) => boolean,
    private onHover: () => void,
  ) {
    const options = { signal: this.abort.signal, capture: true };
    world.canvas.addEventListener("pointermove", this.move, options);
    world.canvas.addEventListener("pointerleave", () => this.highlight(null), options);
    world.canvas.addEventListener("click", this.click, options);
    world.canvas.addEventListener("dblclick", this.click, options);
  }
  update = (): void => {
    for (const target of this.targets) {
      target.mesh.visible =
        !this.world.active &&
        this.world.canonicalVisibility.states[target.id].opacity > 0 &&
        (!this.world.planePickerAccept || this.world.planePickerAccept(target.frame));
      positionPlanePatch(target.mesh, target.frame, canonicalPlaneBounds(this.world, target.frame));
    }
    if (this.hovered && !this.available(this.hovered)) this.hovered = null;
    this.paint();
  };
  private available(target: PlaneTarget): boolean {
    return (
      target.mesh.visible &&
      canonicalPlaneSelectable(this.world, target.id) &&
      (viewDisplay().planes > 0 || viewDisplay().grid > 0) &&
      (this.world.planePicker ? this.world.canNavigate() : this.world.canEnterSketch())
    );
  }
  private hit(point: Point): PlaneTarget | null {
    const rect = this.world.canvas.getBoundingClientRect();
    this.raycaster.setFromCamera(
      new THREE.Vector2(
        ((point.x - rect.left) / rect.width) * 2 - 1,
        1 - ((point.y - rect.top) / rect.height) * 2,
      ),
      this.world.camera,
    );
    const targets = this.targets.filter((t) => this.available(t));
    const hit = this.raycaster
      .intersectObjects(
        targets.map((t) => t.mesh),
        false,
      )
      .find((hit) => this.world.visiblePoint(hit.point));
    if (!hit || this.occupied(point, hit.point.distanceTo(this.world.camera.position))) return null;
    return targets.find((t) => t.mesh === hit.object) ?? null;
  }
  private move = (event: PointerEvent): void => {
    if (event.buttons || this.world.planePickerAccept) return;
    const target = this.hit({ x: event.clientX, y: event.clientY });
    if (target) event.stopImmediatePropagation();
    this.highlight(target);
  };
  private click = (event: MouseEvent): void => {
    if (event.button || event.metaKey || event.ctrlKey || this.world.planePickerAccept) return;
    if (this.world.planePicker && event.type !== "click") return;
    const target = this.hit({ x: event.clientX, y: event.clientY });
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (this.world.planePicker) this.world.planePicker(target.id);
    else if (event.type === "click") this.world.planeSelection?.(target.id);
    else if (this.world.sketchEntry) this.world.sketchEntry(target.id);
    else this.world.enter(target.id);
  };
  private paint(): void {
    for (const t of this.targets) {
      const selected = t.id === this.world.selectedPlane;
      const active = selected || t === this.hovered;
      t.mesh.userData.hovered = t === this.hovered;
      t.mesh.userData.selected = selected;
      t.mesh.userData.selectable = this.available(t);
      t.mesh.userData.visibility = this.world.canonicalVisibility.states[t.id].opacity;
      t.mesh.material.color.set(active ? "#83b9ee" : planeTargetBaseColor(t.id));
      t.mesh.material.opacity =
        viewDisplay().planes * this.world.canonicalVisibility.states[t.id].opacity;
      t.mesh.material.stencilWrite = !selected && !this.world.planePicker;
    }
  }
  private highlight(target: PlaneTarget | null): void {
    if (this.hovered === target) return;
    this.hovered = target;
    this.paint();
    if (target) this.onHover();
    this.world.requestDraw();
  }
  dispose(): void {
    this.abort.abort();
  }
}
