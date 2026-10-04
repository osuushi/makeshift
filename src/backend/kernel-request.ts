import type {
  BodyBoolean,
  BodyEdgeFinish,
  BodyErosion,
  BodyFaceOffset,
  BodyShell,
  BodyTransform,
  EdgeMovement,
  FaceMovement,
} from "../model/body.js";
import type { CleanupSelection } from "../model/cleanup.js";
import type { ExactBody } from "../model/exact-body.js";
import type { kernelInput, loftInput, pathSweepInput, revolveInput } from "./kernel-input.js";
import type { projectionInput } from "./projection.js";

type Request =
  | ((
      | import("../model/mesh-fit.js").MeshFitInput
      | import("../model/mesh-fit.js").MeshReconstructionInput
    ) & {
      kind: "fit-mesh";
      bodies: readonly ExactBody[];
    })
  | ReturnType<typeof import("./sketch-offset.js").sketchOffsetInput>
  | ReturnType<typeof kernelInput>
  | ReturnType<typeof loftInput>
  | ReturnType<typeof revolveInput>
  | ReturnType<typeof pathSweepInput>
  | ReturnType<typeof projectionInput>
  | (import("../model/plane-cut.js").PlaneCut & { kind: "plane-cut"; bodies: readonly ExactBody[] })
  | {
      kind: "cleanup" | "delete-topology";
      selection: CleanupSelection[];
      bodies: readonly ExactBody[];
    }
  | {
      kind: "sections";
      frame: import("../sketch/planes.js").PlaneFrame;
      bodies: readonly ExactBody[];
    }
  | { kind: "topology"; body: string; bodies: readonly ExactBody[] }
  | (import("../model/topology-edit.js").FaceReplacement & {
      kind: "replace-face";
      bodies: readonly ExactBody[];
    })
  | { kind: "inspect"; bodies: readonly ExactBody[]; deflection?: number }
  | {
      kind: "scale";
      ids: string[];
      pivot: import("../sketch/planes.js").Vector;
      factor: number;
      factors?: import("../sketch/planes.js").Vector;
      bodies: readonly ExactBody[];
    }
  | {
      kind: "scale-boundaries";
      faces: BodyFaceOffset["faces"];
      edges: BodyEdgeFinish["edges"];
      pivot: import("../sketch/planes.js").Vector;
      factor: number;
      factors?: import("../sketch/planes.js").Vector;
      bodies: readonly ExactBody[];
    }
  | ReturnType<typeof import("./measurement-input.js").measurementInput>
  | (Omit<BodyEdgeFinish, "size"> & { kind: "edge-finish-selection"; bodies: readonly ExactBody[] })
  | (Omit<Extract<import("../model/mirror.js").MirrorOperation, { kind: "bodies" }>, "kind"> & {
      kind: "mirror";
      bodies: readonly ExactBody[];
    })
  | (BodyShell & { kind: "shell"; bodies: readonly ExactBody[] })
  | (BodyErosion & { kind: "erode"; bodies: readonly ExactBody[] })
  | (BodyFaceOffset & { kind: "offset-faces"; bodies: readonly ExactBody[] })
  | (EdgeMovement & { kind: "move-edges"; bodies: readonly ExactBody[] })
  | (FaceMovement & { kind: "move-faces"; bodies: readonly ExactBody[] })
  | (BodyEdgeFinish & { kind: "edge-finish"; bodies: readonly ExactBody[] })
  | (BodyBoolean & { kind: "boolean"; bodies: readonly ExactBody[] })
  | (BodyTransform & { kind: "transform"; bodies: readonly ExactBody[] });

type ExactRequest<T> = T extends { bodies: readonly ExactBody[] }
  ? Omit<T, "bodies"> & { bodies: readonly ExactBody[] }
  : never;
export type KernelRequest = ExactRequest<Request>;
