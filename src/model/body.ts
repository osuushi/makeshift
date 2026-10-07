import type { PlaneFrame, Vector } from "../sketch/planes.js";

export interface Face {
  /** Oriented wire occurrences; a seam can use the same edge twice. */
  readonly edges: readonly string[];
  readonly id: string;
  readonly signature: number[];
  readonly vertices: number[];
  readonly plane: PlaneFrame | null;
  /** Nearest directly reachable parallel planar or concentric wall in this body. */
  readonly thickness?: { face: string; distance: number; slope: 1 | -1 } | null;
  /** Tangent face closure required for a normal offset (distinct from blend resizing). */
  readonly offsetFaces?: readonly string[];
  readonly offsetHandle?: { center: Vector; normal: Vector } | null;
  /** Recognized current-geometry blend and its required tangent patches. */
  readonly blend?: {
    radius: number;
    outward: 1 | -1;
    faces: readonly string[];
  } | null;
  readonly chamfer?: {
    distance: number;
    distanceScale: number;
    outward: 1 | -1;
    faces: readonly string[];
  } | null;
  /** Derived analytic measurement; other surface classes remain ordinary faces. */
  readonly cylinder?: { origin: Vector; axis: Vector; radius: number; outward: 1 | -1 } | null;
  readonly sphere?: { radius: number; outward: 1 | -1 } | null;
  /** Axis points away from the apex along the represented positive-radius nappe. */
  readonly cone?: { apex: Vector; axis: Vector; semiAngle: number; outward: 1 | -1 } | null;
}
export type EdgeCurve =
  | { kind: "line"; a: Vector; b: Vector }
  | { kind: "arc"; a: Vector; b: Vector; mid: Vector }
  | { kind: "circle"; center: Vector; normal: Vector; radius: number };
export interface Edge {
  readonly curve: EdgeCurve | null;
  readonly id: string;
  readonly signature: number[];
  readonly points: number[];
}
/** Read-only geometry for drawing, picking and mesh decorators; no exact-shape authority. */
export interface BodyGeometry {
  readonly id: string;
  readonly volume: number;
  readonly center: Vector;
  readonly bounds: number[];
  readonly faces: readonly Face[];
  readonly edges: readonly Edge[];
}
/** Accepted and kernel-computed bodies have an authoritative exact shape. */
export interface Body extends BodyGeometry {
  readonly brep: string;
}
export type BooleanMode = "new" | "union" | "subtract" | "intersect";
export type LiftSource = { sketch: string; profile: string } | { face: string };
export type ExtrusionDraft = { mode: "angle" | "offset"; value: number };
export interface Extrusion {
  /** Signed distance is total cap-to-cap depth; source stays at the midplane. */
  symmetric?: boolean;
  draft?: ExtrusionDraft;
  /** Signed total degrees about the source normal, through an in-plane origin. */
  twist?: { angle: number; origin: Vector };
  sources: LiftSource[];
  distance: number;
  mode: BooleanMode | "auto";
  targets?: string[];
  /** UI-visible candidates; independent of explicit Boolean target selection. */
  eligibleTargets?: string[];
}

export interface BodyTransform {
  ids: string[];
  pivot: Vector;
  axis: Vector;
  angle: number;
  translation: Vector;
  duplicate: boolean;
}
export interface FaceMovement extends Omit<BodyTransform, "ids" | "duplicate"> {
  /** Disjoint complete bodies move rigidly within the same atomic edit. */
  bodyIds?: string[];
  faces: { body: string; face: string }[];
}

export interface EdgeMovement {
  bodyIds?: string[];
  edges: { body: string; edge: string }[];
  translation: Vector;
}

export interface BodyBoolean {
  ids: string[];
  mode: Exclude<BooleanMode, "new">;
  keepOriginals: boolean;
}

export interface BodyEdgeFinish {
  edges: { body: string; edge: string }[];
  size: number;
  mode: "fillet" | "chamfer";
}

export interface BodyFaceOffset {
  /** When present, rebuild a recognized blend at this radius instead of normal offset. */
  radius?: number;
  /** Radius represents equal setback distance when rebuilding a chamfer. */
  chamfer?: boolean;
  faces: { body: string; face: string }[];
  distance: number;
}

/** Temporary screw sweep inputs; accepted bodies retain only materialized geometry. */
export interface Revolution {
  sources: LiftSource[];
  axis: { origin: Vector; direction: Vector };
  angle: number;
  height: number;
  mode: BooleanMode | "auto";
  targets?: string[];
  /** UI-visible candidates; independent of explicit Boolean target selection. */
  eligibleTargets?: string[];
}

export interface BodyShell {
  selection: { body: string; faces: string[] }[];
  /** Signed distance: negative inward, positive outward. Empty faces means closed hollow. */
  thickness: number;
}

/** Whole-body erosion; resulting bodies have independent geometry identities. */
export interface BodyErosion {
  /** Remesh uses mesh erosion and reconstruction; Analytic uses CAD offsets. Defaults to Remesh. */
  method?: "fast" | "accurate";
  /** Retain inputs alongside new eroded bodies. Defaults to true. */
  keepOriginals?: boolean;
  ids: string[];
  thickness: number;
  /** Analytic only: maximum extra erosion in mm. Defaults to zero; ignored by Remesh. */
  allowance?: number;
  /** Remesh only: geometry-sensitive sampling detail. Defaults to Standard. */
  meshDetail?: "coarse" | "standard" | "fine";
  /** Remesh only: maximum CAD faces per source body, 32–256. Defaults to 128. */
  maxFaces?: number;
}
