import * as THREE from "three";
import { type Affine, composeAffine, identityAffine, inverseAffine } from "../model/affine.js";
import { screenRay } from "../model/body-ray-hits.js";
import { type LinkedBench, resolvePlacements } from "../model/smart-object.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { Point } from "../sketch/planes.js";
import { LinkedDrawable, LinkedGeometry } from "./drawables.js";

interface SceneItem {
  root: string | null;
  source: string;
  transform: Affine;
  key: string;
}

/** Linked and contextual geometry stays in a read-only scene, outside modeling operands. */
export class SmartObjectScene {
  private group = new THREE.Group();
  private shapes = new Map<string, LinkedGeometry>();
  private drawings = new Map<string, LinkedDrawable>();
  private pickable: { id: string; group: THREE.Group }[] = [];
  private bounds = new THREE.Box3();
  private previousBounds: () => THREE.Box3;

  constructor(private editor: SketchEditor) {
    const world = editor.world;
    world.scene.add(this.group);
    world.changed.add(this.update);
    this.previousBounds = world.depthBounds;
    world.depthBounds = () =>
      this.bounds.isEmpty()
        ? this.previousBounds()
        : this.previousBounds().clone().union(this.bounds);
    editor.modeling.linkedHits = (screen) => this.hit(screen);
    this.update();
  }

  private items(lookup: (id: string) => LinkedBench | undefined): SceneItem[] {
    const store = this.editor.store;
    const objects = (this.editor.display.smartObjects ?? []).filter(({ id }) =>
      this.editor.visibility.visible(id),
    );
    const items: SceneItem[] = [...resolvePlacements(objects, lookup)].map((placement) => ({
      ...placement,
      key: JSON.stringify(placement.path),
    }));
    let inverse = identityAffine;
    for (const { parent, placement } of [...store.benchFocus.inline].reverse()) {
      inverse = composeAffine(inverse, inverseAffine(placement.transform));
      items.push({
        root: null,
        source: parent,
        transform: inverse,
        key: JSON.stringify([null, parent]),
      });
      const neighbors = (lookup(parent)?.smartObjects ?? []).filter(
        ({ id }) => id !== placement.id,
      );
      for (const item of resolvePlacements(neighbors, lookup, inverse))
        items.push({ ...item, root: null, key: JSON.stringify([null, parent, ...item.path]) });
    }
    return items;
  }

  private update = (): void => {
    const { store, modeling, world } = this.editor;
    if (!store.linkedBenches?.length && !this.drawings.size) return;
    const sources = new Map(store.linkedBenches?.map(({ id, display }) => [id, display]));
    sources.set(store.editingBench, store.data);
    const items = this.items((id) => sources.get(id));
    const keys = new Set(items.map(({ key }) => key));
    const benches = new Set(items.map(({ source }) => source));
    for (const [key, drawing] of this.drawings) {
      if (keys.has(key)) continue;
      drawing.dispose();
      this.drawings.delete(key);
    }
    for (const [id, geometry] of this.shapes) {
      const source = sources.get(id);
      if (benches.has(id) && source && geometry.matches(source)) continue;
      geometry.dispose();
      this.shapes.delete(id);
    }
    const selected = new Set(
      modeling.targets.flatMap((target) =>
        target.kind === "smart-object" ? [target.instance] : [],
      ),
    );
    const hovered = modeling.hover?.kind === "smart-object" ? modeling.hover.instance : null;
    this.pickable = [];
    const bounds = new THREE.Box3();
    for (const item of items) {
      const source = sources.get(item.source);
      if (!source) continue;
      const drawing = this.drawing(item, source);
      drawing.group.matrix.set(...item.transform, 0, 0, 0, 1);
      drawing.group.matrixWorldNeedsUpdate = true;
      drawing.style(
        source,
        item.root === null,
        !!item.root && selected.has(item.root),
        hovered !== null && item.root === hovered,
        this.editor.bodiesVisible,
      );
      bounds.union(drawing.geometry.bounds.clone().applyMatrix4(drawing.group.matrix));
      if (item.root) this.pickable.push({ id: item.root, group: drawing.group });
    }
    if (!this.bounds.equals(bounds)) {
      this.bounds = bounds;
      world.requestDraw();
    }
  };

  private drawing(item: SceneItem, source: LinkedBench): LinkedDrawable {
    let geometry = this.shapes.get(item.source);
    if (!geometry) {
      geometry = new LinkedGeometry(source);
      this.shapes.set(item.source, geometry);
    }
    const previous = this.drawings.get(item.key);
    if (previous?.geometry === geometry) return previous;
    previous?.dispose();
    const drawing = new LinkedDrawable(geometry);
    this.group.add(drawing.group);
    this.drawings.set(item.key, drawing);
    return drawing;
  }

  private hit(screen: Point) {
    if (!this.pickable.length) return [];
    const world = this.editor.world;
    const ray = screenRay(this.editor, screen);
    const caster = new THREE.Raycaster(ray.origin, ray.direction);
    caster.params.Line.threshold = (world.height / world.canvas.clientHeight) * 5;
    this.group.updateMatrixWorld(true);
    const hits = new Map<string, number>();
    for (const { id, group } of this.pickable) {
      const hit = caster
        .intersectObjects(group.children.filter(({ visible }) => visible))
        .find(({ point }) => world.visiblePoint(point));
      if (hit)
        hits.set(
          id,
          Math.min(hits.get(id) ?? Infinity, hit.point.distanceTo(world.camera.position)),
        );
    }
    return [...hits].map(([id, depth]) => ({ id, depth }));
  }

  dispose(): void {
    this.editor.world.changed.delete(this.update);
    this.editor.world.depthBounds = this.previousBounds;
    this.editor.modeling.linkedHits = undefined;
    for (const drawing of this.drawings.values()) drawing.dispose();
    for (const shape of this.shapes.values()) shape.dispose();
    this.group.removeFromParent();
  }
}
