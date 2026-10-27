import * as THREE from "three";
import { screenRay } from "../model/body-ray-hits.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { Vector } from "../sketch/planes.js";
import { solidOccludesRay } from "./solid-ray.js";

/** Match opaque solid surfaces and section-cap parity, excluding transparent/X-ray passes. */
export function guideVisibleThroughSolids(editor: SketchEditor, point: Vector): boolean {
  const position = new THREE.Vector3(...point);
  if (editor.world.crossSection && !editor.world.visiblePoint(position)) return false;
  if (!editor.bodiesVisible) return true;
  const screen = editor.world.project(point);
  const ray = screenRay(editor, screen);
  const clipping = editor.world.clippingAt(screen);
  const depth = position.clone().sub(ray.origin).dot(ray.direction);
  for (const body of editor.display.bodies ?? []) {
    const alpha =
      editor.display.bodyAppearances?.find((entry) => entry.body === body.id)?.alpha ?? 1;
    if (!editor.visibility.visible(body.id) || alpha < 1) continue;
    if (solidOccludesRay(body, ray, depth, clipping)) return false;
  }
  return true;
}
