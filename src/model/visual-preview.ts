import type { Extrusion } from "./body.js";

/** A validated drawing only: no exact shape, editable topology, or persistent IDs. */
export interface VisualBody {
  /** Appearance references only; these do not make the drawing editable. */
  sourceBodies?: string[];
  sourceFaces?: string[][];
  sourceEdges?: string[][];
  bounds: [number, number, number, number, number, number];
  faces: number[][];
  planes: (import("../sketch/planes.js").PlaneFrame | null)[];
  edges: number[][];
}
export interface VisualPreview {
  bodies: VisualBody[];
  /** Accepted operands replaced by this drawing, not editable preview identities. */
  replaces?: string[];
}

/** Other tools keep their complete previews until their live metadata needs are reviewed. */
export function visualExtrusion(extrusion: Extrusion, bodyCount: number): boolean {
  return (
    extrusion.sources.length > 0 &&
    extrusion.sources.every((source) => "sketch" in source) &&
    (extrusion.mode === "new" || (extrusion.mode === "auto" && bodyCount === 0)) &&
    !extrusion.draft?.value &&
    !extrusion.twist?.angle
  );
}
