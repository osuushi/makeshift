import * as THREE from "three";
import type { SketchEditor } from "../sketch/editor.js";
import { type Point, type Vector, worldPoint } from "../sketch/planes.js";
import { resolvedGuides } from "./evaluate.js";
import { guideOwner } from "./types.js";

export function visibleGuides(editor: SketchEditor, accepted = false) {
  return resolvedGuides(accepted ? editor.store.data : editor.display).filter(
    ({ guide, point }) =>
      !guide.hidden &&
      editor.visibility.visible(guideOwner(guide.anchor)) &&
      (guide.anchor.kind === "sketch-curve" || editor.bodiesVisible) &&
      (!!editor.world.activeFrame || editor.world.visiblePoint(new THREE.Vector3(...point))),
  );
}
/** Projection follows the current camera ray, including off-plane guide points. */
export function sketchGuideTargets(editor: SketchEditor, exclude: ReadonlySet<string> = new Set()) {
  const frame = editor.world.activeFrame;
  if (!frame) return [];
  return visibleGuides(editor, true).flatMap(({ guide, point }) => {
    if (
      guide.anchor.kind === "sketch-curve" &&
      guide.anchor.sketch === editor.sketch?.id &&
      exclude.has(guide.anchor.curve)
    )
      return [];
    const screen = editor.world.project(point);
    const projected = editor.world.pointAt(frame, screen.x, screen.y);
    return projected ? [{ point: projected, label: guide.name }] : [];
  });
}
export function guideSnap(
  editor: SketchEditor,
  screen: Point,
  excludeOwners: readonly string[] = [],
): { point: Vector | null; ambiguous: boolean } {
  const nearby = visibleGuides(editor, true)
    .filter(({ guide }) => !excludeOwners.includes(guideOwner(guide.anchor)))
    .map(({ guide, point }) => {
      const p = editor.world.project(point);
      return { guide, point, distance: Math.hypot(p.x - screen.x, p.y - screen.y) };
    })
    .filter((p) => p.distance <= 10)
    .sort((a, b) => a.distance - b.distance);
  const first = nearby[0];
  if (!first) return { point: null, ambiguous: false };
  // Do not silently choose between close, distinct world points. Hide one to disambiguate.
  const competing = nearby.find(
    (p) =>
      p !== first &&
      p.distance - first.distance < 3 &&
      new THREE.Vector3(...p.point).distanceTo(new THREE.Vector3(...first.point)) > 1e-7,
  );
  if (competing) return { point: null, ambiguous: true };
  const frame = editor.world.activeFrame;
  if (!frame) return { point: first.point, ambiguous: false };
  const p = editor.world.project(first.point),
    local = editor.world.pointAt(frame, p.x, p.y);
  return { point: local ? worldPoint(frame, local) : null, ambiguous: false };
}
