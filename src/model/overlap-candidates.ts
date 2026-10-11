import * as THREE from "three";
import type { SketchEditor } from "../sketch/editor.js";
import type { ModelingTarget } from "../sketch/model-selection-state.js";
import { type PlaneFrame, type PlaneId, type Point, planes } from "../sketch/planes.js";
import type { Profile } from "../sketch/profiles.js";
import { BodyPickProbe } from "./body-picking.js";
import { edgeRayHits } from "./edge-selection.js";
import { overlapSketchCandidates } from "./overlap-sketches.js";
import { sectionBodyHits } from "./section-picking.js";

export type OverlapTarget =
  | Extract<ModelingTarget, { kind: "body" | "face" | "edge" | "sketch" | "profile" }>
  | { kind: "profiles"; sketch: string; profiles: Profile[] }
  | { kind: "plane"; frame: PlaneFrame; world?: PlaneId; saved?: string };
export interface OverlapCandidate {
  target: OverlapTarget;
  depth: number;
  key: string;
  label: string;
}
export function overlapCandidates(editor: SketchEditor, screen: Point): OverlapCandidate[] {
  const probe = new BodyPickProbe(editor, screen);
  const ray = probe.ray;
  const bodies = probe.bodies;
  const result: OverlapCandidate[] = [];
  for (const hit of probe.faces())
    result.push({
      target: { kind: "face", body: hit.body, face: hit.face },
      depth: hit.depth,
      key: hit.face,
      label: "Face",
    });
  for (const hit of edgeRayHits(editor, screen, bodies, ray))
    result.push({
      target: { kind: "edge", body: hit.body, edge: hit.edge, point: hit.point },
      depth: hit.depth,
      key: hit.edge,
      label: "Edge",
    });
  const sections = sectionBodyHits(
    bodies,
    ray,
    editor.world.partialSection ?? editor.world.crossSection,
    editor.world.camera.position,
  );
  for (const body of bodies) {
    const hits = result.filter((c) => "body" in c.target && c.target.body === body.id);
    const section = sections.find((hit) => hit.body === body.id);
    if (hits.length || section)
      result.push({
        target: { kind: "body", body: body.id },
        depth: Math.min(section?.depth ?? Infinity, ...hits.map((h) => h.depth)),
        key: body.id,
        label: "Body",
      });
  }
  const refs: Extract<OverlapTarget, { kind: "plane" }>[] = [
    ...Object.entries(planes).map(([id, frame]) => ({
      kind: "plane" as const,
      frame,
      world: id as PlaneId,
    })),
    ...(editor.display.constructionPlanes ?? [])
      .filter((p) => editor.visibility.visible(p.id))
      .map((p) => ({ kind: "plane" as const, frame: p.frame, saved: p.id })),
  ];
  result.push(...planeCandidates(editor, refs, ray));
  result.push(
    ...overlapSketchCandidates(
      editor,
      screen,
      refs.map((r) => r.frame),
    ),
  );
  const rank = (c: OverlapCandidate) =>
    c.target.kind === "edge" ? 0 : c.target.kind === "face" ? 1 : c.target.kind === "body" ? 2 : 3;
  return result
    .filter(
      (c) =>
        !editor.modeling.memberBody ||
        (c.target.kind !== "plane" &&
          c.target.kind !== "profiles" &&
          editor.modeling.allows(c.target)),
    )
    .sort((a, b) => a.depth - b.depth || rank(a) - rank(b) || a.key.localeCompare(b.key));
}

function planeCandidates(
  editor: SketchEditor,
  refs: Extract<OverlapTarget, { kind: "plane" }>[],
  ray: THREE.Ray,
): OverlapCandidate[] {
  const result: OverlapCandidate[] = [];
  const camera = editor.world.camera.position;
  for (const target of refs) {
    const { frame } = target,
      u = new THREE.Vector3(...frame.u),
      v = new THREE.Vector3(...frame.v),
      origin = new THREE.Vector3(...frame.origin);
    const support = new THREE.Plane().setFromNormalAndCoplanarPoint(u.clone().cross(v), origin);
    const hit = ray.intersectPlane(support, new THREE.Vector3());
    if (!hit || !editor.world.visiblePoint(hit)) continue;
    const local = hit.clone().sub(origin),
      bounds = editor.world.planeBounds(frame),
      x = local.dot(u),
      y = local.dot(v);
    if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) continue;
    result.push({
      target,
      depth: hit.distanceTo(camera),
      key: target.world ?? target.saved ?? "plane",
      label: target.world ? `Plane · ${target.world}` : "Plane",
    });
  }
  return result;
}
