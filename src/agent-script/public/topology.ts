import type { Vector } from "./common.js";
/** Radius at origin; at axial distance t, cone radius = radius + t*tan(semiAngle). Degrees/mm. */
export type AxialSurface =
  | { kind: "cylinder"; origin: Vector; axis: Vector; radius: number }
  | { kind: "cone"; origin: Vector; axis: Vector; radius: number; semiAngle: number };
export interface FaceReplacement {
  body: string;
  face: string;
  surface: AxialSurface;
}
export interface BodyTopology {
  body: string;
  units: "mm";
  faces: {
    id: string;
    reversed: boolean;
    surface:
      | (AxialSurface & { outward: 1 | -1 })
      | { kind: "plane"; origin: Vector; u: Vector; v: Vector }
      | { kind: "other" };
    area: number;
    /** Conservative world kernel bounds, not exact metrology. */
    bounds: number[];
    /** Ordered edge uses on the forward face support; periodic seams occur twice. */
    loops: { outer: boolean; edges: { edge: string; reversed: boolean; seam: boolean }[] }[];
  }[];
  edges: {
    id: string;
    faces: string[];
    curve:
      | { kind: "line"; a: Vector; b: Vector }
      | {
          kind: "circle";
          center: Vector;
          normal: Vector;
          xAxis: Vector;
          radius: number;
          start: number;
          end: number;
        }
      | { kind: "other" };
  }[];
}
