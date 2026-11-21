import { smartObjectSources } from "../model/smart-object.js";
import type { ModelReply, ModelRequest, ModelView } from "../sketch/model-api.js";
import { cutEdgeHighlights } from "./cut-edge-highlights.js";
import type { DecoratorSession } from "./decorator-session.js";
import type { DocumentSession } from "./document-session.js";
import type { DrawingBenches } from "./drawing-benches.js";
import { linkedView } from "./linked-view.js";
import type { SolidEdits } from "./solid-edits.js";

type DrawingQuery = Extract<ModelRequest, { kind: "read-drawing" | "smart-object-sources" }>;

export function isDrawingQuery(request: ModelRequest): request is DrawingQuery {
  return request.kind === "read-drawing" || request.kind === "smart-object-sources";
}

export function drawingQuery(
  view: ModelView,
  benches: DrawingBenches,
  request: DrawingQuery,
): ModelReply {
  const drawing = benches.snapshot();
  return request.kind === "read-drawing"
    ? { view, drawing }
    : { view, smartObjectSources: smartObjectSources(drawing, benches.editing) };
}

export function documentView(
  session: DocumentSession,
  solids: SolidEdits,
  decorators: DecoratorSession,
  status: Pick<ModelView, "planeCutAvailable" | "cleanupAvailable">,
): ModelView {
  const { store, candidate, pendingOperation, reopenedPreview } = session;
  return {
    ...linkedView(session.benches),
    activeBench: session.benches.active,
    benchTabs: session.benches.tabs,
    data: store.data,
    canUndoView: store.canNavigateView("undo"),
    canRedoView: store.canNavigateView("redo"),
    ...solids.previewQuality(
      candidate || session.visualPreview ? pendingOperation?.kind : undefined,
    ),
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
    visualPreview: session.visualPreview,
    cutEdges:
      candidate && candidate !== store.data
        ? (reopenedPreview?.cutEdges ?? cutEdgeHighlights.get(candidate))
        : undefined,
    solveCount: session.solveCount,
    solveMs: session.solveMs,
  };
}
