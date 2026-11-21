import assert from "node:assert/strict";
import type { DocumentOwner } from "../src/backend/document-owner.js";
import type { ModelRequest } from "../src/sketch/model-api.js";

/** Geometry assertions wait for the solid, independently of the sketch edit reply. */
export async function profileCall(owner: DocumentOwner, request: ModelRequest) {
  const edited = await owner.call(request);
  assert.equal(edited.error, undefined);
  if (!edited.view.profileEdit?.pending) return edited.view;
  const rebuilt = await owner.call({ kind: "read-profile-preview" });
  assert.equal(rebuilt.error, undefined);
  return rebuilt.view;
}
