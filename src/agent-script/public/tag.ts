import type { Vector } from "./common.js";
import type { SolidResult } from "./modeling.js";
export type TagMember = { kind: "face" | "edge"; id: string };
export interface TaggedGroup {
  id: string;
  body: string;
  name: string;
  description?: string;
  members: readonly TagMember[];
  problems: readonly ("lost" | "expanded" | "inferred" | "split")[];
  splitFrom?: string;
}
export type TagEdit =
  | {
      action: "create";
      body: string;
      name: string;
      description?: string;
      members: readonly TagMember[];
    }
  | {
      action: "update";
      id: string;
      name?: string;
      description?: string;
      members?: readonly TagMember[];
    }
  | { action: "remove"; id: string };
export type TaggedOperation =
  | { kind: "offsetFaces"; distance: number }
  | { kind: "moveFaces"; translation: Vector; pivot: Vector; axis: Vector; angle: number }
  | { kind: "finishEdges"; mode: "fillet" | "chamfer"; size: number }
  | { kind: "shell"; thickness: number }
  | { kind: "scale"; pivot: Vector; factor: number };
export interface TagScriptApi {
  taggedGroups(): Promise<readonly TaggedGroup[]>;
  editTaggedGroup(input: TagEdit): Promise<readonly TaggedGroup[]>;
  /** Resolve current membership; incompatible member types reject. No UI selection required. */
  applyTaggedGroup(input: { id: string; operation: TaggedOperation }): Promise<SolidResult>;
}
