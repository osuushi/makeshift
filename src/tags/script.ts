import type { ScriptOperation } from "../agent-script/api.js";

export type { TaggedOperation, TagScriptApi } from "../agent-script/public/tag.js";
export type TagScriptOperation = Extract<
  ScriptOperation,
  {
    kind: "taggedGroups" | "editTaggedGroup" | "applyTaggedGroup";
  }
>;
