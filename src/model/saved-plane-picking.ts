import * as THREE from "three";
import type { SketchEditor } from "../sketch/editor.js";
import { pickModels } from "../sketch/model-selection.js";
import type { Point } from "../sketch/planes.js";
import { toolCatalog } from "../tools/catalog.js";
import type { ConstructionPlane } from "./construction-plane.js";

export function pickSavedPlane(editor: SketchEditor, screen: Point, maxDepth = Infinity) {
  const rect = editor.world.canvas.getBoundingClientRect();
  const ray = new THREE.Raycaster();
  ray.setFromCamera(
    new THREE.Vector2(
      ((screen.x - rect.left) / rect.width) * 2 - 1,
      1 - ((screen.y - rect.top) / rect.height) * 2,
    ),
    editor.world.camera,
  );
  let closest: { plane: ConstructionPlane; depth: number } | null = null;
  for (const plane of editor.display.constructionPlanes ?? []) {
    if (!editor.visibility.visible(plane.id)) continue;
    const origin = new THREE.Vector3(...plane.frame.origin);
    const u = new THREE.Vector3(...plane.frame.u),
      v = new THREE.Vector3(...plane.frame.v);
    const support = new THREE.Plane().setFromNormalAndCoplanarPoint(u.clone().cross(v), origin);
    const hit = ray.ray.intersectPlane(support, new THREE.Vector3());
    if (!hit || !editor.world.visiblePoint(hit)) continue;
    const local = hit.clone().sub(origin);
    const bounds = editor.world.planeBounds(plane.frame);
    if (
      local.dot(u) < bounds.minX ||
      local.dot(u) > bounds.maxX ||
      local.dot(v) < bounds.minY ||
      local.dot(v) > bounds.maxY
    )
      continue;
    const depth = hit.distanceTo(editor.world.camera.position);
    if (depth > maxDepth + 1e-5 || (closest && closest.depth <= depth)) continue;
    closest = { plane, depth };
  }
  return closest && (editor.world.planePicker || !pickModels(editor, screen).length)
    ? closest
    : null;
}

/** Canvas capture keeps saved-plane interiors ahead of ordinary model handlers. */
export function savedPlaneInteraction(
  editor: SketchEditor,
  signal: AbortSignal,
  choose: (plane: ConstructionPlane) => void,
  hover: (id: string | null) => void,
  enter: (plane: ConstructionPlane) => void,
): void {
  const canvas = editor.world.canvas;
  const options = { signal, capture: true };
  // Clear before the world-plane capture handler can consume the next hover.
  canvas.parentElement?.addEventListener("pointermove", () => hover(null), options);
  canvas.parentElement?.addEventListener("pointerdown", () => hover(null), options);
  for (const type of ["pointermove", "click", "dblclick"] as const) {
    canvas.addEventListener(
      type,
      (event) => {
        if (
          editor.world.active ||
          (type === "pointermove"
            ? editor.blocked || editor.isDragging || !!editor.interactions.current
            : !!toolCatalog(editor).reason({ reason: () => null })) ||
          event.buttons ||
          event.metaKey ||
          event.ctrlKey
        ) {
          hover(null);
          return;
        }
        const hit = pickSavedPlane(editor, { x: event.clientX, y: event.clientY });
        hover(hit?.plane.id ?? null);
        if (!hit) return;
        event.stopImmediatePropagation();
        editor.modeling.hover = null;
        if (type === "click") choose(hit.plane);
        if (type === "dblclick") enter(hit.plane);
        editor.refresh();
      },
      options,
    );
  }
  canvas.addEventListener("pointerleave", () => hover(null), options);
}
