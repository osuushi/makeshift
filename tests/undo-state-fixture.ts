import type { DocumentOwner } from "../src/backend/document-owner.js";

/** Failed attempts are diagnostic records, not changes to the Undo/Redo stack. */
export async function undoState(owner: DocumentOwner) {
  const reply = await owner.call({ kind: "read-history" });
  return {
    canUndo: reply.view.canUndo,
    canRedo: reply.view.canRedo,
    entries: reply.history?.filter((entry) => entry.outcome === "changed"),
  };
}
