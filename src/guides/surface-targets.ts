import * as THREE from "three";
import { visibleAnchorPoint } from "../model/anchor-snapping.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { Vector } from "../sketch/planes.js";
import { near } from "./geometry.js";
import { guideMovePoints } from "./move-points.js";
import type { GuideMoveCandidate } from "./move-target.js";
import type { GuideSurfacePlan } from "./tool-path.js";
import {
  cylinderRadial,
  type GuideToolPath,
  type GuideToolPlan,
  toolPathPoint,
} from "./tool-path.js";

export function guideSurfacePlan(
  editor: SketchEditor,
  plan: GuideToolPlan | null,
): GuideSurfacePlan | null {
  const session = plan?.begin();
  if (!plan || !session) return null;
  return {
    origin: plan.path.origin,
    targets: surfaceGuideTargets(editor, (point) => surfacePointDistance(plan.path, point)).map(
      (target) => {
        const point = toolPathPoint({ ...plan.path, distanceScale: 1 }, target.distance ?? 0);
        if (!point || near(point, target.point)) return target;
        return {
          ...target,
          alignment: { point, ...(plan.path.cylinder ? { cylinder: plan.path.cylinder } : {}) },
          ...(plan.path.plane
            ? { plane: { frame: { ...plan.path.plane, origin: target.point } } }
            : {}),
        };
      },
    ),
    settled: session.settled,
  };
}

/** Tool handles fit their surface through the reference, not their handle onto it. */
export function surfacePointDistance(path: GuideToolPath, point: Vector): number | null {
  const distance = path.cylinder
    ? (cylinderRadial(point, path.cylinder).length() - path.cylinder.radius) * path.cylinder.outward
    : new THREE.Vector3(...point)
        .sub(new THREE.Vector3(...path.origin))
        .dot(new THREE.Vector3(...path.direction));
  return toolPathPoint(path, distance) ? distance : null;
}

export function surfaceGuideTargets(
  editor: SketchEditor,
  solve: (point: Vector) => number | null,
): GuideMoveCandidate[] {
  return guideMovePoints(editor, editor.store.data).flatMap((candidate) => {
    const distance = solve(candidate.point);
    if (distance === null || Math.abs(distance) < 1e-7) return [];
    if (
      editor.world.crossSection &&
      !editor.world.visiblePoint(new THREE.Vector3(...candidate.point))
    )
      return [];
    return [
      {
        ...candidate,
        distance,
        guide: candidate.guide && editor.world.visiblePoint(new THREE.Vector3(...candidate.point)),
        visible:
          candidate.saved ||
          visibleAnchorPoint(editor, candidate.point, editor.store.data.bodies, false),
      },
    ];
  });
}
