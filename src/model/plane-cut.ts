import type { PlaneFrame } from "../sketch/planes.js";

/** Supply exactly one evaluated frame or exact face support reference. */
export interface PlaneCut {
  mode: "split" | "imprint";
  targets: { body: string; faces?: string[] }[];
  frame?: PlaneFrame;
  surface?: { body: string; face: string };
}
