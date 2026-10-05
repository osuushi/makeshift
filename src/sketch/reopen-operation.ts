import { reopenBodyTransform } from "../model/reopen-body-transform.js";
import type { ModelRequest } from "./model-api.js";
import type { HistoryOperation } from "./operation-history.js";

/** Parameters from the existing accepted history, not a saved feature tree. */
export type ReopenRequest =
  | Extract<
      ModelRequest,
      {
        kind:
          | "extrude"
          | "boolean-bodies"
          | "revolve"
          | "loft"
          | "shell"
          | "erode"
          | "finish-edges"
          | "offset-faces"
          | "scale"
          | "mirror"
          | "plane-cut"
          | "project"
          | "transform-bodies"
          | "move-faces"
          | "move-edges"
          | "construction-plane";
      }
    >
  | { kind: "cleanup"; selection: import("../model/cleanup.js").CleanupSelection[] };
export interface ReopenOperation {
  request: ReopenRequest;
  cleanup: boolean;
}
export function reopenOperation(operation: HistoryOperation): ReopenOperation | undefined {
  const { cleanup, ...parameters } = operation.parameters;
  // Ordinary controls cannot preserve an API-only combined cleanup operation.
  // Reject it before rollback rather than silently changing its completion intent.
  if (cleanup === true) return;
  const payload = {
    extrude: "extrusion",
    "boolean-bodies": "operation",
    revolve: "revolution",
    loft: "operation",
    shell: "operation",
    erode: "operation",
    "finish-edges": "operation",
    "offset-faces": "operation",
    cleanup: "selection",
    scale: "operation",
    mirror: "operation",
    "plane-cut": "operation",
    project: "projection",
    "transform-bodies": "transform",
    "move-faces": "operation",
    "move-edges": "operation",
    "construction-plane": "plane",
  } as const;
  if (!(operation.kind in payload)) return;
  const key = payload[operation.kind as keyof typeof payload];
  if (!parameters[key]) return;
  if (
    operation.kind === "transform-bodies" &&
    !reopenBodyTransform(parameters.transform as import("../model/body.js").BodyTransform)
  )
    return;
  return {
    request: structuredClone({ kind: operation.kind, ...parameters }) as ReopenRequest,
    cleanup: false,
  };
}
