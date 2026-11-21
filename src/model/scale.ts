import type { Vector } from "../sketch/planes.js";
import type { BodyEdgeFinish, BodyFaceOffset } from "./body.js";

export type ScaleSource =
  | { kind: "curves"; sketchId: string; ids: string[] }
  | { kind: "sketches"; ids: string[] }
  | {
      kind: "solids";
      ids: string[];
      smartObjectIds?: string[];
      faces: BodyFaceOffset["faces"];
      edges: BodyEdgeFinish["edges"];
    };
export type ScaleOperation = ScaleSource & { pivot: Vector; factor: number; factors?: Vector };

export function scaleFactors(operation: ScaleOperation): Vector {
  return operation.factors ?? [operation.factor, operation.factor, operation.factor];
}

export function identityScale(operation: ScaleOperation): boolean {
  return scaleFactors(operation).every((value) => value === 1);
}

export function validateScale(operation: ScaleOperation): void {
  if (!Number.isFinite(operation.factor) || operation.factor <= 0)
    throw new Error("Enter a positive scale factor");
  if (
    operation.factors &&
    (operation.factors.length !== 3 ||
      !operation.factors.every((value) => Number.isFinite(value) && value > 0))
  )
    throw new Error("Enter positive X, Y and Z scale factors");
  if (
    !Array.isArray(operation.pivot) ||
    operation.pivot.length !== 3 ||
    !operation.pivot.every(Number.isFinite)
  )
    throw new Error("Choose a finite scale pivot");
}
