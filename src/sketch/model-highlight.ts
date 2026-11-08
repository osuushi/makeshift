import * as THREE from "three";
import { viewportPalette } from "../preferences/viewport-theme.js";
import { boundaryPoints } from "./curve-spans.js";
import type { SketchEditor } from "./editor.js";
import { type ModelingTarget, modelingKey } from "./model-selection-state.js";
import { type PlaneFrame, worldPoint } from "./planes.js";
import { type Profile, profilesFor } from "./profiles.js";
import { sketchFillLayer } from "./region-fill.js";
import { regionGridCoordinates, regionMaterial } from "./region-material.js";

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
    if (!sketch || (target.kind === "sketch" && target.curves)) return;
    const profiles = target.kind === "profile" ? [target.profile] : profilesFor(sketch);
    const scale = editor.world.height / editor.world.canvas.clientHeight;
    const geometry = profileGeometry(profiles, sketch.plane, scale);
    const options: THREE.MeshBasicMaterialParameters = {
      color: hover ? viewportPalette().hover : viewportPalette().selectionStroke,
      opacity: hover ? 0.55 : 0.95,
      // Keep sketch ink intact while tinting section material underneath it.
      stencilWrite: true,
      stencilRef: 0,
      stencilFuncMask: 16,
      stencilWriteMask: 0,
      stencilFunc: THREE.EqualStencilFunc,
    };
    const material = regionMaterial(hover ? 0.1 : 0.32, options);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.layers.set(sketchFillLayer);
    mesh.renderOrder = 6;
    group.add(mesh);
    if (!hover) {
      const hiddenMaterial = regionMaterial(0.06, {
        ...options,
        depthFunc: THREE.GreaterDepth,
        opacity: 0.24,
      });
      const hidden = new THREE.Mesh(geometry.clone(), hiddenMaterial);
      hidden.layers.set(sketchFillLayer);
      hidden.renderOrder = 6;
      group.add(hidden);
    }
  };
  const update = () => {
    const selection = editor.modeling;
    const mergeable = editor.mergeableSketches;
    const key = `${editor.visibility.key}:${editor.world.active}:${selection.targets.map(modelingKey)}:${selection.hover ? modelingKey(selection.hover) : ""}:${mergeable.map((sketch) => sketch.id)}:${editor.world.height}:${editor.world.canvas.clientHeight}:${viewportPalette().selectionStroke}`;
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
  const positions: number[] = [],
    coordinates: number[] = [];
  const gridCoordinates = regionGridCoordinates(plane, scale);
  for (const profile of profiles) {
    const outer = boundaryPoints(profile.outer, scale),
      holes = profile.holes.map((h) => boundaryPoints(h, scale));
    const points = [...outer, ...holes.flat()];
    const vector = (p: { x: number; y: number }) => new THREE.Vector2(p.x, p.y);
    for (const triangle of THREE.ShapeUtils.triangulateShape(
      outer.map(vector),
      holes.map((h) => h.map(vector)),
    ))
      for (const i of triangle) {
        const position = worldPoint(plane, points[i]);
        positions.push(...position);
        coordinates.push(...gridCoordinates(position));
      }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(coordinates, 2));
  return geometry;
}
