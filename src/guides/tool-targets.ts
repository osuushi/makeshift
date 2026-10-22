import * as THREE from "three";
import { visibleAnchorPoint } from "../model/anchor-snapping.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { Vector } from "../sketch/planes.js";
import { near } from "./geometry.js";
import { guideMovePlanes } from "./move-planes.js";
import { guideMovePoints } from "./move-points.js";
import type { GuideMoveCandidate } from "./move-target.js";
import {
  cylinderRadial,
  type GuideToolPath,
  toolPathPoint,
  toolPlaneDistance,
  toolPointDistance,
} from "./tool-path.js";

/** Solve before drawing or hit testing: unreachable points never become destinations. */
export function guideToolTargets(editor: SketchEditor, path: GuideToolPath): GuideMoveCandidate[] {
  const document = editor.store.data;
  const targets: GuideMoveCandidate[] = [];
  for (const candidate of guideMovePoints(editor, document)) {
    const distance = toolPointDistance(path, candidate.point);
    if (distance !== null) targets.push({ ...candidate, distance, visible: true });
    else {
      const alignment = alignToolPoint(path, candidate.point);
      if (alignment)
        targets.push({
          ...candidate,
          ...alignment,
          label: `${path.cylinder ? "Radius" : "Height"} of ${candidate.label}`,
          saved: false,
          guide: false,
          visible: true,
        });
    }
  }
  for (const candidate of guideMovePlanes(editor, document, path.origin)) {
    if (!candidate.plane) continue;
    const distance = toolPlaneDistance(path, candidate.plane.frame);
    const point = distance !== null ? toolPathPoint(path, distance) : null;
    if (point && distance !== null)
      targets.push({ ...candidate, point, distance, saved: false, visible: true });
  }
  return targets
    .filter(
      (p) =>
        !near(p.point, path.origin) &&
        (!editor.world.crossSection || editor.world.visiblePoint(new THREE.Vector3(...p.point))),
    )
    .map((p) => ({
      ...p,
      // A virtual cap can lie in front of the selected sketch's automatic X-ray plane.
      // Keep body occlusion, but do not clip away the tool's own reachable trajectory.
      guide: p.guide && editor.world.visiblePoint(new THREE.Vector3(...p.point)),
      visible: visibleAnchorPoint(editor, p.point, document.bodies, false),
    }));
}

/** Height/radius matching is explicitly a surface relation, never point coincidence. */
export function alignToolPoint(path: GuideToolPath, referencePoint: Vector) {
  const delta = new THREE.Vector3(...referencePoint).sub(new THREE.Vector3(...path.origin));
  const distance = path.cylinder
    ? (cylinderRadial(referencePoint, path.cylinder).length() - path.cylinder.radius) *
      path.cylinder.outward
    : delta.dot(new THREE.Vector3(...path.direction)) * (path.distanceScale ?? 1);
  const point = toolPathPoint(path, distance);
  if (!point) return null;
  return {
    point,
    distance,
    alignment: { point: referencePoint, ...(path.cylinder ? { cylinder: path.cylinder } : {}) },
    ...(path.plane ? { plane: { frame: { ...path.plane, origin: referencePoint } } } : {}),
  };
}
