import * as THREE from "three";
import type { Face } from "../model/body.js";
import type { InteractionLease } from "../sketch/active-interaction.js";
import { type PlaneFrame, planeNormal, type Vector } from "../sketch/planes.js";

export interface GuideToolPath {
  origin: Vector;
  direction: Vector;
  plane?: PlaneFrame;
  cylinder?: NonNullable<Face["cylinder"]>;
  /** Symmetric extrusion's parameter is total cap-to-cap depth. */
  distanceScale?: number;
}
export interface GuideSurfacePlan {
  origin: Vector;
  targets:
    | import("./move-target.js").GuideMoveCandidate[]
    | Promise<import("./move-target.js").GuideMoveCandidate[]>;
  settled(value: number): Promise<boolean>;
}
export interface GuideToolSession {
  lease: InteractionLease;
  preview(distance: number | null): void;
  settled(distance: number): Promise<boolean>;
  release(keep: boolean): Promise<void>;
}
export interface GuideToolPlan {
  path: GuideToolPath;
  begin(): GuideToolSession | null;
}
export type GuideToolInput = (point: Vector) => GuideToolPlan | null;

const tolerance = 1e-6;
const vector = (p: Vector) => new THREE.Vector3(...p);

/** A guide may control the infinite supporting surface, outside the trimmed face. */
export function planarGuidePath(
  origin: Vector,
  plane: PlaneFrame,
  direction: Vector = planeNormal(plane),
): GuideToolPath | null {
  const height = vector(origin)
    .sub(vector(plane.origin))
    .dot(vector(planeNormal(plane)));
  return Math.abs(height) <= tolerance ? { origin, direction, plane } : null;
}

export function faceGuidePath(origin: Vector, face: Face): GuideToolPath | null {
  // Blend resizing has different kinematics from moving its supporting surface.
  if (face.blend || face.chamfer) return null;
  if (face.plane) return planarGuidePath(origin, face.plane);
  const cylinder = face.cylinder;
  if (!cylinder) return null;
  const radial = cylinderRadial(origin, cylinder);
  if (Math.abs(radial.length() - cylinder.radius) > tolerance) return null;
  return {
    origin,
    direction: radial.normalize().multiplyScalar(cylinder.outward).toArray() as Vector,
    cylinder,
  };
}

export function cylinderRadial(point: Vector, cylinder: NonNullable<Face["cylinder"]>) {
  const delta = vector(point).sub(vector(cylinder.origin));
  return delta.addScaledVector(vector(cylinder.axis), -delta.dot(vector(cylinder.axis)));
}

export function toolPathPoint(path: GuideToolPath, distance: number): Vector | null {
  if (!Number.isFinite(distance)) return null;
  if (path.cylinder && path.cylinder.radius + path.cylinder.outward * distance <= tolerance)
    return null;
  return vector(path.origin)
    .addScaledVector(vector(path.direction), distance / (path.distanceScale ?? 1))
    .toArray() as Vector;
}

/** Coincidence is possible only on this tool's one-dimensional point trajectory. */
export function toolPointDistance(path: GuideToolPath, point: Vector): number | null {
  const delta = vector(point).sub(vector(path.origin));
  const distance = delta.dot(vector(path.direction)) * (path.distanceScale ?? 1);
  const result = toolPathPoint(path, distance);
  return result && vector(result).distanceTo(vector(point)) <= tolerance ? distance : null;
}

/** Parallel/coincident paths do not determine one unique distance. */
export function toolPlaneDistance(path: GuideToolPath, plane: PlaneFrame): number | null {
  const normal = vector(planeNormal(plane));
  const divisor = normal.dot(vector(path.direction));
  if (Math.abs(divisor) < 1e-8) return null;
  const distance =
    (normal.dot(vector(plane.origin).sub(vector(path.origin))) / divisor) *
    (path.distanceScale ?? 1);
  return toolPathPoint(path, distance) ? distance : null;
}
