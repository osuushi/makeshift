import * as THREE from "three";
import { BodyPickProbe } from "../model/body-picking.js";
import { pickBodyEdge } from "../model/edge-selection.js";
import { curveDistance } from "./curve-geometry.js";
import type { Sketch } from "./document.js";
import type { SketchEditor } from "./editor.js";
import type { ModelingTarget } from "./model-selection-state.js";
import { type Point, worldPoint } from "./planes.js";
import { profileAt } from "./profiles.js";

export function pickModels(
  editor: SketchEditor,
  screen: Point,
  maxDepth = Infinity,
): ModelingTarget[] {
  const hits: { target: ModelingTarget; depth: number; edge: boolean }[] = [];
  for (const sketch of editor.display.sketches) {
    if (!editor.visibility.visible(sketch.id)) continue;
    const point = editor.world.pointAt(sketch.plane, screen.x, screen.y);
    if (!point) continue;
    const tolerance = (editor.world.height / editor.world.canvas.clientHeight) * 6;
    const edge = sketch.curves.some((c) => curveDistance(c, point) < tolerance);
    const profile = profileAt(sketch, point);
    if (!edge && !profile) continue;
    const p = worldPoint(sketch.plane, point),
      camera = editor.world.camera.position;
    if (!editor.world.visiblePoint(new THREE.Vector3(...p))) continue;
    hits.push({
      target:
        edge || !profile
          ? { kind: "sketch", sketch: sketch.id }
          : { kind: "profile", sketch: sketch.id, profile },
      edge,
      depth: Math.hypot(p[0] - camera.x, p[1] - camera.y, p[2] - camera.z),
    });
  }
  const probe = new BodyPickProbe(editor, screen);
  for (const { id, depth } of editor.modeling.linkedHits?.(screen) ?? [])
    hits.push({ target: { kind: "smart-object", instance: id }, depth, edge: false });
  const face = probe.faces()[0];
  if (face)
    hits.push({
      target: { kind: "face", body: face.body, face: face.face },
      depth: face.depth + 1e-5,
      edge: false,
    });
  hits.sort((a, b) => a.depth - b.depth || Number(b.edge) - Number(a.edge));
  const edge = pickBodyEdge(editor, screen, probe);
  // Keep coincident geometry ahead of translucent planes despite the face sort bias.
  const targets = hits.filter((hit) => hit.depth <= maxDepth + 1e-4).map((hit) => hit.target);
  if (edge && edge.depth <= maxDepth + 1e-4) {
    const target = { kind: "edge", body: edge.body, edge: edge.edge, point: edge.point } as const;
    const foreground = hits.find(
      (hit) => hit.target.kind === "smart-object" && hit.depth + 1e-4 < edge.depth,
    );
    if (foreground) targets.splice(targets.indexOf(foreground.target) + 1, 0, target);
    else targets.unshift(target);
  }
  const selectedSketches = new Set(
    editor.modeling.targets.filter((target) => target.kind === "sketch").map((t) => t.sketch),
  );
  const priority = (target: ModelingTarget) =>
    !editor.world.active && target.sketch !== undefined && selectedSketches.has(target.sketch);
  return targets
    .filter((target) => editor.modeling.allows(target))
    .sort((a, b) => Number(priority(b)) - Number(priority(a)));
}
export function pickModel(editor: SketchEditor, screen: Point): ModelingTarget | null {
  return pickModels(editor, screen)[0] ?? null;
}

/**
 * Returns fully contained visible topology. Faces win when a box contains both
 * faces and their boundary edges, so a face-editing gesture stays directly usable.
 */
export function selectModelsInFrustum(editor: SketchEditor, a: Point, b: Point): ModelingTarget[] {
  if (!editor.bodiesVisible) return [];
  const left = Math.min(a.x, b.x),
    right = Math.max(a.x, b.x),
    top = Math.min(a.y, b.y),
    bottom = Math.max(a.y, b.y);
  const contains = (point: Point) =>
    point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
  const contained = (points: readonly number[]) => {
    for (let i = 0; i < points.length; i += 3)
      if (!contains(editor.world.project([points[i], points[i + 1], points[i + 2]]))) return false;
    return points.length > 0;
  };
  const faces: ModelingTarget[] = [],
    edges: ModelingTarget[] = [];
  for (const body of editor.display.bodies ?? []) {
    if (
      !editor.visibility.visible(body.id) ||
      (editor.modeling.memberBody && editor.modeling.memberBody !== body.id)
    )
      continue;
    for (const face of body.faces)
      if (contained(face.vertices)) faces.push({ kind: "face", body: body.id, face: face.id });
    for (const edge of body.edges)
      if (contained(edge.points)) edges.push({ kind: "edge", body: body.id, edge: edge.id });
  }
  return faces.length ? faces : edges;
}
export function modelingSketch(editor: SketchEditor): Sketch | undefined {
  const ids = new Set(editor.modeling.targets.map((t) => t.sketch));
  return ids.size === 1 ? editor.display.sketches.find((s) => ids.has(s.id)) : undefined;
}
