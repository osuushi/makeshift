import * as THREE from "three";
import { boundaryPoints } from "./curve-spans.js";
import type { SketchEditor } from "./editor.js";
import { type ModelingTarget, modelingKey } from "./model-selection-state.js";
import { type PlaneFrame, worldPoint } from "./planes.js";
import { type Profile, profilesFor } from "./profiles.js";
import { sketchFillLayer } from "./region-fill.js";
import { stableClipping } from "./stable-clipping.js";

export function modelHighlight(editor: SketchEditor): () => void {
  const group = new THREE.Group();
  editor.world.scene.add(group);
  let previous = "",
    document = editor.display;
  const clear = () => {
    for (const child of [...group.children]) {
      const mesh = child as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
      mesh.geometry.dispose();
      mesh.material.dispose();
      group.remove(mesh);
    }
  };
  const draw = (target: ModelingTarget, hover: boolean) => {
    if (
      target.kind === "edge" ||
      target.kind === "face" ||
      target.kind === "body" ||
      !editor.visibility.visible(target.sketch)
    )
      return;
    const sketch = editor.display.sketches.find((s) => s.id === target.sketch);
    if (!sketch) return;
    const profiles = target.kind === "profile" ? [target.profile] : profilesFor(sketch);
    const scale = editor.world.height / editor.world.canvas.clientHeight;
    const geometry = profileGeometry(profiles, sketch.plane, scale);
    const material = new THREE.MeshBasicMaterial({
      color: hover ? "#c78a36" : "#337ac4",
      transparent: true,
      opacity: hover ? 0.16 : 0.3,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      // Keep sketch ink intact while tinting section material underneath it.
      stencilWrite: true,
      stencilRef: 0,
      stencilFuncMask: 16,
      stencilWriteMask: 0,
      stencilFunc: THREE.EqualStencilFunc,
    });
    stableClipping(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.layers.set(sketchFillLayer);
    mesh.renderOrder = 6;
    group.add(mesh);
    if (!hover) {
      const hiddenMaterial = stableClipping(material.clone());
      hiddenMaterial.depthFunc = THREE.GreaterDepth;
      hiddenMaterial.opacity = 0.09;
      const hidden = new THREE.Mesh(geometry.clone(), hiddenMaterial);
      hidden.layers.set(sketchFillLayer);
      hidden.renderOrder = 6;
      group.add(hidden);
    }
  };
  const update = () => {
    const selection = editor.modeling;
    const mergeable = editor.mergeableSketches;
    const key = `${editor.visibility.key}:${editor.world.active}:${selection.targets.map(modelingKey)}:${selection.hover ? modelingKey(selection.hover) : ""}:${mergeable.map((sketch) => sketch.id)}:${editor.world.height}`;
    if (previous === key && document === editor.display) return;
    previous = key;
    document = editor.display;
    clear();
    if (editor.world.active) return;
    for (const target of selection.targets) draw(target, false);
    for (const sketch of mergeable) draw({ kind: "sketch", sketch: sketch.id }, true);
    if (
      selection.hover &&
      !selection.targets.some(
        (t) => modelingKey(t) === modelingKey(selection.hover as ModelingTarget),
      )
    )
      draw(selection.hover, true);
  };
  editor.world.changed.add(update);
  return () => {
    editor.world.changed.delete(update);
    clear();
    editor.world.scene.remove(group);
  };
}

function profileGeometry(profiles: readonly Profile[], plane: PlaneFrame, scale: number) {
  const positions: number[] = [];
  for (const profile of profiles) {
    const outer = boundaryPoints(profile.outer, scale),
      holes = profile.holes.map((h) => boundaryPoints(h, scale));
    const points = [...outer, ...holes.flat()];
    const vector = (p: { x: number; y: number }) => new THREE.Vector2(p.x, p.y);
    for (const triangle of THREE.ShapeUtils.triangulateShape(
      outer.map(vector),
      holes.map((h) => h.map(vector)),
    ))
      for (const i of triangle) positions.push(...worldPoint(plane, points[i]));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}
