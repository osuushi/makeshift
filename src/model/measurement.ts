import type { Vector } from "../sketch/planes.js";

export type MeasurementTarget =
  | { kind: "plane"; plane: string }
  | { kind: "profile"; sketch: string; profile: string }
  | { kind: "curve"; sketch: string; curve: string }
  | { kind: "face"; body: string; face: string }
  | { kind: "edge"; body: string; edge: string };
export interface MeasuredDistance {
  value: number;
  points: [Vector, Vector];
}
export interface Measurement {
  properties: { label: string; value: number; unit: "mm" | "mm²" | "°" }[];
  relationships: string[];
  distance?: MeasuredDistance;
  minimumGap?: MeasuredDistance;
  maximumGap?: MeasuredDistance;
  approximate?: boolean;
  gapReason?: string;
}
