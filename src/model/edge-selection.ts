import * as THREE from "three";
import type { SketchEditor } from "../sketch/editor.js";
import type { Point, Vector } from "../sketch/planes.js";
import type { BodyGeometry } from "./body.js";
import { BodyPickProbe } from "./body-picking.js";
import { edgeFacesCamera, screenRay } from "./body-ray-hits.js";
import { featureEdges } from "./feature-edges.js";

interface EdgeHit {
  body: string;
  edge: string;
  distance: number;
  depth: number;
  point: Vector;
}

const edgePickRadiusPx = 7;
const distanceTiePx = 0.1;
// Render tessellation and projected edge depth may differ slightly, in millimeters.
const occlusionSlackMm = 0.06;

/** Shared projected segments; consumers decide visible-only versus all-depth eligibility. */
function* edgeCandidates(editor: SketchEditor, screen: Point, bodies: readonly BodyGeometry[]) {
  const camera = editor.world.camera.position;
  for (const body of bodies)
    for (const edge of featureEdges(body)) {
      const a = new THREE.Vector3(),
        b = new THREE.Vector3();
      for (let i = 0; i + 3 < edge.points.length; i += 3) {
        a.fromArray(edge.points, i);
        b.fromArray(edge.points, i + 3);
        const A = editor.world.project(a.toArray() as Vector),
          B = editor.world.project(b.toArray() as Vector);
        const dx = B.x - A.x,
          dy = B.y - A.y;
        const t = Math.max(
          0,
          Math.min(1, ((screen.x - A.x) * dx + (screen.y - A.y) * dy) / (dx * dx + dy * dy || 1)),
        );
        const nearest = { x: A.x + dx * t, y: A.y + dy * t };
        const distance = Math.hypot(screen.x - nearest.x, screen.y - nearest.y);
        if (distance > edgePickRadiusPx) continue;
        a.lerp(b, t);
        if (!editor.world.visiblePoint(a)) continue;
        yield {
          source: body,
          screen: nearest,
          hit: {
            body: body.id,
            edge: edge.id,
            distance,
            depth: a.distanceTo(camera),
            point: a.toArray() as Vector,
          },
        };
      }
    }
}

export function pickBodyEdge(
  editor: SketchEditor,
  screen: Point,
  probe = new BodyPickProbe(editor, screen),
): EdgeHit | null {
  let best: EdgeHit | null = null;
  for (const { source, screen: nearest, hit } of edgeCandidates(editor, screen, probe.bodies)) {
    if (!probe.edgeRevealed(hit.body, hit.edge, nearest)) continue;
    const layer = probe.layer(hit.body);
    if (
      best &&
      (layer > probe.layer(best.body) ||
        (layer === probe.layer(best.body) && hit.distance > best.distance + distanceTiePx))
    )
      continue;
    if (!edgeFacesCamera(source, hit.edge, hit.point, probe.ray.direction)) continue;
    const covering = probe.faces(nearest).find((face) => probe.layer(face.body) === layer);
    if (covering && hit.depth > covering.depth + occlusionSlackMm) continue;
    if (
      !best ||
      layer < probe.layer(best.body) ||
      hit.distance < best.distance - distanceTiePx ||
      hit.depth < best.depth
    )
      best = hit;
  }
  if (best && probe.layer(best.body) && probe.faces().some((face) => !probe.layer(face.body)))
    return null;
  return best;
}

/** The overlap chooser keeps covered front-facing edges, testing the best segment per edge. */
export function edgeRayHits(
  editor: SketchEditor,
  screen: Point,
  bodies: readonly BodyGeometry[],
  ray = screenRay(editor, screen),
): EdgeHit[] {
  const best = new Map<string, { source: BodyGeometry; hit: EdgeHit }>();
  for (const { source, hit } of edgeCandidates(editor, screen, bodies)) {
    const key = JSON.stringify([hit.body, hit.edge]),
      previous = best.get(key)?.hit;
    if (
      !previous ||
      hit.distance < previous.distance - distanceTiePx ||
      (Math.abs(hit.distance - previous.distance) <= distanceTiePx && hit.depth < previous.depth)
    )
      best.set(key, { source, hit });
  }
  return [...best.values()]
    .filter(({ source, hit }) => edgeFacesCamera(source, hit.edge, hit.point, ray.direction))
    .map(({ hit }) => hit)
    .sort((a, b) => a.depth - b.depth);
}
