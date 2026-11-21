import { regionTolerance } from "../sketch/curve-spans.js";
import type { Curve, Segment, Sketch } from "../sketch/document.js";
import type { PlaneFrame } from "../sketch/planes.js";
import type { Body } from "./body.js";

export interface ProfileSelection {
  body: string;
  /** Empty selects the whole turned exterior. */
  faces: string[];
}

export interface RevolvedProfile {
  frame: PlaneFrame;
  height: number;
  endGuides: boolean;
  spans: { face: string; curves: Curve[] }[];
}

export interface ProfileEditView {
  body: string;
  height: number;
  endGuides: boolean;
  sketch: Sketch;
  draft?: Sketch;
  preview?: Body;
  canUndo: boolean;
  canRedo: boolean;
  removedDimples: number;
  error?: string;
}

export function flatProfileCap(curve: Curve): curve is Segment {
  return (
    curve.kind === "segment" &&
    Math.abs(curve.a.y - curve.b.y) <= regionTolerance &&
    Math.min(Math.abs(curve.a.x), Math.abs(curve.b.x)) <= regionTolerance
  );
}
