import type { ModelRequest } from "../sketch/model-api.js";

/** Host replacement belongs to DocumentSession, including files and agent binding. */
export type HostModelRequest = ModelRequest & {
  kind: Exclude<ModelRequest["kind"], "new" | "open">;
};
const kinds: Record<HostModelRequest["kind"], true> = {
  "paste-geometry": true,
  "navigation-history": true,
  "tagged-group": true,
  "export-geometry": true,
  "export-step": true,
  "cancel-step-export": true,
  "decorator-draft": true,
  decorator: true,
  "decorator-definition": true,
  "decorator-enable": true,
  "decorator-inspect": true,
  "offset-sketch": true,
  sections: true,
  selection: true,
  "body-appearance": true,
  "rename-entity": true,
  "reorder-entity": true,
  "check-plane-cut": true,
  scale: true,
  "plane-cut": true,
  "construction-plane": true,
  "delete-plane": true,
  mirror: true,
  measure: true,
  "center-of-mass": true,
  "cancel-preview": true,
  "supersede-preview": true,
  "check-cleanup": true,
  "read-history": true,
  cleanup: true,
  "delete-topology": true,
  accept: true,
  project: true,
  "transform-bodies": true,
  "move-edges": true,
  "move-faces": true,
  "boolean-bodies": true,
  "edge-finish-selection": true,
  shell: true,
  erode: true,
  "reconstruct-mesh": true,
  "offset-faces": true,
  "finish-edges": true,
  revolve: true,
  extrude: true,
  loft: true,
  "place-sketch": true,
  "merge-sketches": true,
  "delete-entities": true,
  "delete-sketch": true,
  read: true,
  discard: true,
  undo: true,
  redo: true,
  reopen: true,
  preview: true,
  edit: true,
  remove: true,
  clear: true,
};

/** Check transport authority; operation parameters are validated by the owner. */
export function hostModelRequest(value: unknown): HostModelRequest {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid model request");
  const kind = (value as { kind?: unknown }).kind;
  if (kind === "new" || kind === "open")
    throw new Error("Use document commands to create or open a document");
  if (typeof kind !== "string" || !Object.hasOwn(kinds, kind))
    throw new Error("Unknown model request");
  return value as HostModelRequest;
}
