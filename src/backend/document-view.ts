import type { ModelView } from "../sketch/model-api.js";
import { cutEdgeHighlights } from "./cut-edge-highlights.js";
import type { DecoratorSession } from "./decorator-session.js";
import type { DocumentSession } from "./document-session.js";
import type { SolidEdits } from "./solid-edits.js";

export function documentView(
  session: DocumentSession,
  solids: SolidEdits,
  decorators: DecoratorSession,
  status: Pick<ModelView, "planeCutAvailable" | "cleanupAvailable">,
): ModelView {
  const { store, candidate, pendingOperation, reopenedPreview } = session;
  return {
    data: store.data,
    canUndoView: store.canNavigateView("undo"),
    canRedoView: store.canNavigateView("redo"),
    ...solids.previewQuality(candidate ? pendingOperation?.kind : undefined),
    decoratorSources: decorators.sources,
    historySelection: store.selection,
    historyNavigation: store.restoredNavigation,
    historyOperation: store.restoredOperation,
    reopenOperation: store.reopenOperation,
    planeCutAvailable: status.planeCutAvailable,
    ...solids.offsetEdit.view,
    edgeSize: solids.edgeSize,
    cleanupAvailable: status.cleanupAvailable,
    edgeSelection: solids.edgeSelection,
    booleanMode: solids.booleanMode,
    booleanTargets: solids.booleanTargets,
    ...reopenedPreview,
    canUndo: store.canUndo,
    canRedo: store.canRedo,
    candidate,
    cutEdges:
      candidate && candidate !== store.data
        ? (reopenedPreview?.cutEdges ?? cutEdgeHighlights.get(candidate))
        : undefined,
    solveCount: session.solveCount,
    solveMs: session.solveMs,
  };
}
