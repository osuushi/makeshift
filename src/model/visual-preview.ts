import type { Body, Extrusion } from "./body.js";

/** A validated drawing only: no exact shape, editable topology, or persistent IDs. */
export interface VisualBody {
  /** Unchanged portion of the same shell, retained in a separate drawing batch. */
  stationary?: VisualBody;
  /** Appearance references only; these do not make the drawing editable. */
  sourceBodies?: string[];
  sourceFaces?: string[][];
  sourceEdges?: string[][];
  bounds: [number, number, number, number, number, number];
  faces: number[][];
  normals?: number[][];
  planes: (import("../sketch/planes.js").PlaneFrame | null)[];
  edges: number[][];
}
export interface VisualPreview {
  bodies: VisualBody[];
  /** Accepted operands replaced by this drawing, not editable preview identities. */
  replaces?: string[];
}

export function visualExtrusion(extrusion: Extrusion, bodies: readonly Body[]): boolean {
  return (
    extrusion.sources.length > 0 &&
    extrusion.sources.every(
      (source) =>
        "sketch" in source ||
        bodies.some((body) => body.faces.some((face) => face.id === source.face && face.plane)),
    ) &&
    !extrusion.draft?.value &&
    !extrusion.twist?.angle
  );
}
