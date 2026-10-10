import { operationCleanup } from "../model/cleanup.js";
import { cancellableCalculation } from "../sketch/calculation-state.js";
import type { SketchDocument } from "../sketch/document.js";
import type { ModelReply, ModelRequest, ModelView } from "../sketch/model-api.js";
import { describeOperation, type HistoryOperation } from "../sketch/operation-history.js";
import { acceptedParameters } from "./accepted-parameters.js";
import { cutEdgeHighlights } from "./cut-edge-highlights.js";
import { DecoratorSession } from "./decorator-session.js";
import { editDocument, isDirectDocumentEdit } from "./document-edits.js";
import { documentFailure } from "./document-failure.js";
import { isPreviewRequest, type PreviewRequest, previewDocument } from "./document-preview.js";
import { DocumentStore } from "./document-store.js";
import { GeometryQueries, isGeometryQuery } from "./geometry-queries.js";
import { NativeSolver } from "./native-solver.js";
import { openDocument } from "./open-document.js";
import { pasteGeometry } from "./paste-geometry.js";
import { planeCutAvailable } from "./plane-cut.js";
import { type ReopenPreview, reopenPreview } from "./reopen-preview.js";
import { ScriptEdits } from "./script-edits.js";
import { SolidCalculator } from "./solid-calculator.js";
import { isSolidRequest, SolidEdits } from "./solid-edits.js";

export class DocumentOwner {
  private kernel: SolidCalculator;
  private decorators = new DecoratorSession();
  private queries: GeometryQueries;
  private solids: SolidEdits;
  private cleanupAvailable = false;
  private planeCutAvailable = false;
  private store = new DocumentStore();
  private pendingOperation: HistoryOperation | null = null;
  private candidate: SketchDocument | null = null;
  private reopenedPreview: ReopenPreview | null = null;
  private active: { kind: ModelRequest["kind"]; promise: Promise<ModelReply> } | null = null;
  private cancelling = false;
  private solveCount = 0;
  private solveMs = 0;
  readonly scripts: ScriptEdits;
  constructor(
    private solver = new NativeSolver(),
    kernelExecutable?: string,
  ) {
    this.kernel = new SolidCalculator(kernelExecutable);
    this.queries = new GeometryQueries(kernelExecutable);
    this.solids = new SolidEdits(this.kernel);
    this.scripts = new ScriptEdits(
      () => this.store,
      this.solids,
      this.kernel,
      solver,
      this.decorators,
    );
  }
  beginScript(name: string): void {
    if (this.active || this.cancelling || this.candidate)
      throw new Error("Finish the current edit first");
    this.scripts.begin(name);
  }
  get view(): ModelView {
    return {
      data: this.store.data,
      canUndoView: this.store.canNavigateView("undo"),
      canRedoView: this.store.canNavigateView("redo"),
      ...this.solids.previewQuality(this.candidate ? this.pendingOperation?.kind : undefined),
      decoratorSources: this.decorators.sources,
      historySelection: this.store.selection,
      historyNavigation: this.store.restoredNavigation,
      historyOperation: this.store.restoredOperation,
      reopenOperation: this.store.reopenOperation,
      planeCutAvailable: this.planeCutAvailable,
      ...this.solids.offsetEdit.view,
      edgeSize: this.solids.edgeSize,
      cleanupAvailable: this.cleanupAvailable,
      edgeSelection: this.solids.edgeSelection,
      booleanMode: this.solids.booleanMode,
      booleanTargets: this.solids.booleanTargets,
      ...this.reopenedPreview,
      canUndo: this.store.canUndo,
      canRedo: this.store.canRedo,
      candidate: this.candidate,
      cutEdges:
        this.candidate && this.candidate !== this.store.data
          ? (this.reopenedPreview?.cutEdges ?? cutEdgeHighlights.get(this.candidate))
          : undefined,
      solveCount: this.solveCount,
      solveMs: this.solveMs,
    };
  }
  private async preview(request: PreviewRequest): Promise<void> {
    const result = await previewDocument(this.store.data, request, this.kernel, this.solver);
    this.solveCount += result.count;
    if (result.count) this.solveMs = result.ms;
    this.candidate = result.document;
    if (request.kind === "edit") await this.accept();
  }
  private replaceDocument(document?: SketchDocument): void {
    this.reopenedPreview = null;
    this.store = new DocumentStore(document);
    this.decorators.clear();
    this.pendingOperation = null;
    this.candidate = null;
  }
  private checkCancellation(): void {
    if (this.cancelling) throw new Error("Calculation cancelled");
  }
  async call(request: ModelRequest): Promise<ModelReply> {
    if (request.kind === "cancel-step-export") {
      await this.queries.cancelStep();
      return { view: this.view };
    }
    if (request.kind === "decorator-inspect" || request.kind === "decorator-draft")
      return {
        view: this.view,
        ...(await this.decorators.query(this.store.data, request)),
      };
    if (this.scripts.busy && request.kind !== "read" && request.kind !== "read-history")
      return { view: this.view, error: "Finish or cancel the running script first" };
    if (isGeometryQuery(request)) return this.queries.call(this.view, request);
    if (request.kind === "read-history") return { view: this.view, history: this.store.history };
    if (request.kind === "supersede-preview") {
      if (
        request.interrupt &&
        this.active &&
        ["extrude", "erode", "check-cleanup"].includes(this.active.kind)
      ) {
        this.kernel.supersede();
        await this.kernel.cancel();
        await this.active?.promise;
      }
      if (this.active && ["finish-edges", "offset-faces"].includes(this.active.kind))
        this.kernel.supersede();
      return { view: this.view };
    }
    if (request.kind === "cancel-preview") return this.cancelPreview();
    if (this.active || this.cancelling) {
      const error = "Finish the current edit first";
      this.store.record(describeOperation(request), "failed", error);
      return { view: this.view, error };
    }
    if (request.kind === "selection") {
      this.store.selections(request.changes);
      return { view: this.view };
    }
    this.kernel.begin();
    const promise = this.execute(request);
    this.active = { kind: request.kind, promise };
    try {
      return await promise;
    } finally {
      this.active = null;
    }
  }
  private async cancelPreview(): Promise<ModelReply> {
    if (this.cancelling || (this.active && !cancellableCalculation(this.active.kind)))
      return { view: this.view, error: "Finish the current edit first" };
    this.cancelling = true;
    try {
      await Promise.all([this.kernel.cancel(), this.solver.cancel(), this.active?.promise]);
      if (this.pendingOperation) this.store.record(this.pendingOperation, "cancelled");
      this.candidate = null;
      this.pendingOperation = null;
      this.reopenedPreview = null;
      return { view: this.view };
    } finally {
      this.cancelling = false;
    }
  }
  private async accept(cleanup = false): Promise<void> {
    if (!this.candidate) throw new Error("No valid edit to accept");
    if (cleanup && (!this.reopenedPreview || this.pendingOperation?.parameters.cleanup !== true)) {
      this.reopenedPreview = null;
      this.candidate = await this.solids.removeTopology(
        this.candidate,
        operationCleanup(this.store.data.bodies ?? [], this.candidate.bodies ?? []),
      );
    }
    const feedback = this.view.cutEdges;
    if (!this.reopenedPreview) this.candidate = await this.decorators.continue(this.candidate);
    if (feedback) cutEdgeHighlights.set(this.candidate, feedback);
    this.checkCancellation();
    this.store.accept(
      this.candidate,
      {
        ...(this.pendingOperation ?? describeOperation({ kind: "accept" })),
        ...(cleanup ? { parameters: { ...this.pendingOperation?.parameters, cleanup: true } } : {}),
      },
      reopenPreview(this.view),
    );
    this.candidate = null;
    this.pendingOperation = null;
    this.reopenedPreview = null;
  }
  private async execute(request: ModelRequest): Promise<ModelReply> {
    const before = this.store.data;
    let operation =
      request.kind === "accept"
        ? (this.pendingOperation ?? describeOperation(request))
        : describeOperation(request);
    if (request.kind === "accept" && request.cleanup)
      operation = { ...operation, parameters: { ...operation.parameters, cleanup: true } };
    try {
      if (request.kind === "check-plane-cut")
        this.planeCutAvailable = await planeCutAvailable(
          this.store.data,
          request.operation,
          this.kernel,
        );
      else await this.dispatch(request, operation);
      if (this.candidate && !this.reopenedPreview)
        this.candidate = await this.decorators.continue(this.candidate);
      this.checkCancellation();
      return { view: this.view, documentChanged: before !== this.store.data };
    } catch (error) {
      const { outcome, ...failure } = documentFailure(
        error,
        request,
        this.cancelling,
        this.kernel.wasSuperseded,
      );
      this.store.record(operation, outcome, failure.error);
      if (request.kind !== "accept" && request.kind !== "check-cleanup") {
        this.candidate = null;
        this.pendingOperation = null;
      }
      return { view: this.view, ...failure };
    }
  }
  private async dispatch(request: ModelRequest, operation: HistoryOperation): Promise<void> {
    if (!["read", "reopen", "accept", "check-cleanup", "navigation-history"].includes(request.kind))
      this.reopenedPreview = null;
    this.cleanupAvailable = false;
    const decoratorEdit =
      request.kind === "decorator" || request.kind === "decorator-enable"
        ? await this.decorators.edit(this.store.data, request)
        : null;
    const direct =
      decoratorEdit ??
      (isDirectDocumentEdit(request) ? editDocument(this.store.data, request) : null);
    if (direct) {
      this.pendingOperation = null;
      this.candidate = null;
      this.store.accept(direct, operation);
      return;
    }
    if (isSolidRequest(request)) {
      this.pendingOperation = operation;
      this.candidate = null;
      this.candidate = await this.solids.calculate(this.store.data, request);
      this.pendingOperation = acceptedParameters(operation, {
        edgeSize: this.solids.edgeSize,
        offsetDistance: this.solids.offsetEdit.view.offsetDistance,
      });
      if (request.kind === "transform-bodies") await this.accept();
      return;
    }
    if (isPreviewRequest(request)) {
      this.pendingOperation = operation;
      this.candidate = null;
      await this.preview(request);
      return;
    }
    await this.dispatchCommand(request, operation);
  }
  private async dispatchCommand(request: ModelRequest, operation: HistoryOperation): Promise<void> {
    switch (request.kind) {
      case "check-cleanup":
        if (this.candidate && !this.reopenedPreview)
          this.cleanupAvailable = await this.solids.checkCleanup(this.store.data, this.candidate);
        break;
      case "cleanup":
      case "delete-topology":
        this.pendingOperation = operation;
        this.candidate = await this.solids.removeTopology(
          this.store.data,
          request.selection,
          request.kind,
        );
        if (request.kind === "delete-topology") await this.accept();
        break;
      case "paste-geometry": {
        const document = await pasteGeometry(
          this.store.data,
          request.text,
          this.kernel,
          request.target,
        );
        this.checkCancellation();
        this.pendingOperation = null;
        this.candidate = null;
        this.store.accept(document, operation);
        break;
      }
      case "open": {
        const document = await openDocument(request.document, this.kernel);
        this.checkCancellation();
        this.replaceDocument(document);
        break;
      }
      case "edge-finish-selection":
        await this.solids.selectFinishEdges(this.store.data, request.operation);
        break;
      case "accept":
        await this.accept(request.cleanup);
        break;
      case "discard":
        if (this.pendingOperation) this.store.record(this.pendingOperation, "cancelled");
        this.pendingOperation = null;
        this.candidate = null;
        break;
      case "reopen":
      case "undo":
      case "redo":
        this.navigateHistory(request.kind);
        break;
      case "navigation-history":
        this.store.navigateView(request.direction);
        break;
      case "new":
        this.replaceDocument();
        break;
      case "delete-entities":
        await this.deleteEntities(request, operation);
        break;
      case "read":
        break;
      default:
        throw new Error("Unknown sketch operation");
    }
  }
  private navigateHistory(direction: "reopen" | "undo" | "redo"): void {
    if (direction === "reopen") {
      if (this.candidate) throw new Error("Finish the current edit first");
      const restored = this.store.reopen();
      this.candidate = restored.candidate;
      this.pendingOperation = this.store.restoredOperation ?? null;
      this.reopenedPreview = restored.preview ?? {};
    } else {
      this.pendingOperation = null;
      this.candidate = null;
      this.store[direction]();
    }
  }
  private async deleteEntities(
    request: Extract<ModelRequest, { kind: "delete-entities" }>,
    operation: HistoryOperation,
  ): Promise<void> {
    this.pendingOperation = null;
    this.candidate = null;
    const reduced = editDocument(this.store.data, request);
    const candidate = request.topology?.length
      ? await this.solids.removeTopology(reduced, request.topology, "delete-topology")
      : reduced;
    const continued = await this.decorators.continue(candidate);
    this.checkCancellation();
    this.store.accept(continued, operation);
  }
  close(): void {
    this.queries.close();
    this.solver.close();
    this.kernel.close();
  }
}
