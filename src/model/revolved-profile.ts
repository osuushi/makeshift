import type { Curve, Sketch } from "../sketch/document.js";
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
  spans: { face: string; curves: Curve[] }[];
}

export interface ProfileEditView {
  body: string;
  height: number;
  sketch: Sketch;
  draft?: Sketch;
  preview?: Body;
  canUndo: boolean;
  canRedo: boolean;
  removedDimples: number;
  error?: string;
}
