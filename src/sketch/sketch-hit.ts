import type { EditingGroup, Endpoint } from "./document.js";
import type { Point } from "./planes.js";
import type { RectangleHandle } from "./rectangle-edit.js";

export type PointHit =
  | { kind: "handle"; group: EditingGroup; handle: RectangleHandle; point: Point }
  | { kind: "endpoint"; endpoint: Endpoint; point: Point }
  | { kind: "midpoint"; curve: string; point: Point }
  | { kind: "center"; group: EditingGroup; point: Point }
  | { kind: "circleCenter"; curve: string; point: Point };
export type Hit =
  | PointHit
  | {
      kind: "translate";
      axis: "x" | "y";
      point: Point;
      displayOffset?: Point;
      displayScreen?: Point;
    }
  | { kind: "bow"; curve: string; side: number; point: Point }
  | { kind: "group"; group: EditingGroup; point: Point }
  | { kind: "curve"; curve: string; point: Point; group?: EditingGroup }
  | { kind: "circleBody"; curve: string; point: Point }
  | { kind: "rotate"; point: Point; displayOffset?: Point; displayScreen?: Point };
export const hitIds = (hit: Hit): readonly string[] =>
  hit.kind === "rotate" || hit.kind === "translate"
    ? []
    : hit.kind === "endpoint"
      ? [hit.endpoint.curve]
      : "curve" in hit
        ? [hit.curve]
        : hit.group.members;
