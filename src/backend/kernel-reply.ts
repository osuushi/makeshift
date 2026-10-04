import type { BodyEdgeFinish } from "../model/body.js";
import type { Measurement } from "../model/measurement.js";
import type { SketchSection } from "../model/sketch-section.js";
import type { BodyTopology } from "../model/topology-edit.js";
import type { Curve } from "../sketch/document.js";
import type { KernelRequest } from "./kernel-request.js";
import type { KernelResult } from "./kernel-result.js";

interface QueryReplies {
  topology: { topology: BodyTopology };
  sections: { sections: SketchSection[] };
  measure: { measurement: Measurement };
  project: { curves: Curve[] };
  "offset-sketch": { curves: Curve[] };
  "edge-finish-selection": { edgeSelection: BodyEdgeFinish["edges"] };
}
export type KernelModelRequest = Exclude<KernelRequest, { kind: keyof QueryReplies }>;
export type KernelReply<Input extends KernelRequest> = Input extends {
  kind: infer Kind extends keyof QueryReplies;
}
  ? QueryReplies[Kind]
  : Input extends { kind: "fit-mesh" }
    ? KernelResult & { fit: import("../model/mesh-fit.js").MeshFitStatistics }
    : Input extends { kind: "inspect" }
      ? KernelResult<"inspect">
      : Input extends { kind: "erode" }
        ? KernelResult & { erosionQuality?: import("../model/erosion-quality.js").ErosionQuality[] }
        : KernelResult;
