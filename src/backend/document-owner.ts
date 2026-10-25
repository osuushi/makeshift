import { operationCleanup } from "../model/cleanup.js";
import { cancellableCalculation } from "../sketch/calculation-state.js";
import type { ModelReply, ModelRequest, ModelView } from "../sketch/model-api.js";
import { describeOperation, type HistoryOperation } from "../sketch/operation-history.js";
import { acceptedParameters } from "./accepted-parameters.js";
import { cutEdgeHighlights } from "./cut-edge-highlights.js";
import { DecoratorSession } from "./decorator-session.js";
import { editDocument, isDirectDocumentEdit } from "./document-edits.js";
import { documentFailure } from "./document-failure.js";
import { DocumentGeometry } from "./document-geometry.js";
import { isPreviewRequest, type PreviewRequest, previewDocument } from "./document-preview.js";
import { DocumentSession } from "./document-session.js";
import { documentView } from "./document-view.js";
import { extrudeVisual } from "./extrude-visual.js";
import { GeometryQueries, isGeometryQuery } from "./geometry-queries.js";
import { NativeSolver } from "./native-solver.js";
import { planeCutAvailable } from "./plane-cut.js";
import { reopenPreview } from "./reopen-preview.js";
import { ScriptEdits } from "./script-edits.js";
import { SolidCalculator } from "./solid-calculator.js";
import { isSolidRequest, SolidEdits } from "./solid-edits.js";

export class DocumentOwner {
  private kernel: SolidCalculator;
  private decorators = new DecoratorSession();
  private queries: GeometryQueries;
  private solids: SolidEdits;
  private geometry: DocumentGeometry;
  private cleanupAvailable = false;
  private planeCutAvailable = false;
  private session = new DocumentSession();
  private active: { kind: ModelRequest["kind"]; promise: Promise<ModelReply> } | null = null;
  private cancelling = false;
  readonly scripts: ScriptEdits;
  constructor(
    private solver = new NativeSolver(),
    kernelExecutable?: string,
  ) {
    this.kernel = new SolidCalculator(kernelExecutable);
    this.queries = new GeometryQueries(kernelExecutable);
    this.solids = new SolidEdits(this.kernel);
    this.geometry = new DocumentGeometry(this.kernel, this.solids, this.decorators);
    this.scripts = new ScriptEdits(
      () => this.session.store,
      this.solids,
      this.kernel,
      solver,
      this.decorators,
    );
  }
  beginScript(name: string): void {
    if (this.active || this.cancelling || this.session.candidate || this.session.visualPreview)
      throw new Error("Finish the current edit first");
    this.scripts.begin(name);
  }
  get view(): ModelView {
    return documentView(this.session, this.solids, this.decorators, {
      planeCutAvailable: this.planeCutAvailable,
      cleanupAvailable: this.cleanupAvailable,
    });
  }

  private async preview(request: PreviewRequest): Promise<void> {
    const result = await previewDocument(
      this.session.store.data,
      request,
      this.kernel,
      this.solver,
    );
    this.session.preview(result);
    if (request.kind === "edit") await this.accept();
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
        ...(await this.decorators.query(this.session.store.data, request)),
      };
    if (this.scripts.busy && request.kind !== "read" && request.kind !== "read-history")
      return { view: this.view, error: "Finish or cancel the running script first" };
    if (isGeometryQuery(request)) return this.queries.call(this.view, request);
    if (request.kind === "read-history")
      return { view: this.view, history: this.session.store.history };
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
      this.session.store.record(describeOperation(request), "failed", error);
      return { view: this.view, error };
    }
    if (request.kind === "selection") {
      this.session.store.selections(request.changes);
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
      this.session.discard();
      this.session.clearPreview();
      return { view: this.view };
    } finally {
      this.cancelling = false;
    }
  }
  private async accept(cleanup = false): Promise<void> {
    if (!this.session.candidate) throw new Error("No valid edit to accept");
    if (
      cleanup &&
      (!this.session.reopenedPreview || this.session.pendingOperation?.parameters.cleanup !== true)
    ) {
      this.session.reopenedPreview = null;
      this.session.candidate = await this.solids.removeTopology(
        this.session.candidate,
        operationCleanup(this.session.store.data.bodies ?? [], this.session.candidate.bodies ?? []),
      );
    }
    const feedback = this.view.cutEdges;
    if (!this.session.reopenedPreview)
      this.session.candidate = await this.decorators.continue(this.session.candidate);
    if (feedback) cutEdgeHighlights.set(this.session.candidate, feedback);
    this.checkCancellation();
    this.session.accept(cleanup, reopenPreview(this.view));
  }

  private async execute(request: ModelRequest): Promise<ModelReply> {
    const before = this.session.store.data;
    const operation = this.session.operation(request);
    try {
      if (request.kind === "check-plane-cut")
        this.planeCutAvailable = await planeCutAvailable(
          this.session.store.data,
          request.operation,
          this.kernel,
        );
      else await this.dispatch(request, operation);
      if (this.session.candidate && !this.session.reopenedPreview)
        this.session.candidate = await this.decorators.continue(this.session.candidate);
      this.checkCancellation();
      return { view: this.view, documentChanged: before !== this.session.store.data };
    } catch (error) {
      const { outcome, ...failure } = documentFailure(
        error,
        request,
        this.cancelling,
        this.kernel.wasSuperseded,
      );
      this.session.store.record(operation, outcome, failure.error);
      if (request.kind !== "accept" && request.kind !== "check-cleanup") {
        this.session.visualPreview = undefined;
        this.session.candidate = null;
        this.session.pendingOperation = null;
      }
      return { view: this.view, ...failure };
    }
  }
  private async dispatch(request: ModelRequest, operation: HistoryOperation): Promise<void> {
    if (request.kind === "sketch-grid") {
      this.session.store.setGrid(request.grid, request.initialize);
      if (this.session.candidate)
        this.session.candidate = {
          ...this.session.candidate,
          sketchGrid: this.session.store.data.sketchGrid,
        };
      return;
    }
    if (!["read", "reopen", "accept", "check-cleanup", "navigation-history"].includes(request.kind))
      this.session.reopenedPreview = null;
    this.cleanupAvailable = false;
    if (request.kind !== "read" && request.kind !== "reopen")
      this.session.visualPreview = undefined;
    const decoratorEdit =
      request.kind === "decorator" || request.kind === "decorator-enable"
        ? await this.decorators.edit(this.session.store.data, request)
        : null;
    const direct =
      decoratorEdit ??
      (isDirectDocumentEdit(request) ? editDocument(this.session.store.data, request) : null);
    if (direct) {
      this.session.pendingOperation = null;
      this.session.candidate = null;
      this.session.store.accept(direct, operation);
      return;
    }
    if (request.kind === "extrude" && request.presentation === "visual") {
      this.session.pendingOperation = operation;
      this.session.candidate = null;
      const result = await extrudeVisual(this.kernel, this.session.store.data, request.extrusion);
      this.checkCancellation();
      this.session.visualPreview = { bodies: result.results };
      this.solids.booleanMode = result.mode;
      this.solids.booleanTargets = [];
      return;
    }
    if (isSolidRequest(request)) {
      this.session.pendingOperation = operation;
      this.session.candidate = null;
      this.session.candidate = await this.solids.calculate(this.session.store.data, request);
      this.session.pendingOperation = acceptedParameters(operation, {
        edgeSize: this.solids.edgeSize,
        offsetDistance: this.solids.offsetEdit.view.offsetDistance,
      });
      if (request.kind === "transform-bodies") await this.accept();
      return;
    }
    if (isPreviewRequest(request)) {
      this.session.pendingOperation = operation;
      this.session.candidate = null;
      await this.preview(request);
      return;
    }
    await this.dispatchCommand(request, operation);
  }
  private async dispatchCommand(request: ModelRequest, operation: HistoryOperation): Promise<void> {
    switch (request.kind) {
      case "check-cleanup":
        if (this.session.candidate && !this.session.reopenedPreview)
          this.cleanupAvailable = await this.solids.checkCleanup(
            this.session.store.data,
            this.session.candidate,
          );
        break;
      case "cleanup":
      case "delete-topology":
        this.session.pendingOperation = operation;
        this.session.candidate = await this.solids.removeTopology(
          this.session.store.data,
          request.selection,
          request.kind,
        );
        if (request.kind === "delete-topology") await this.accept();
        break;
      case "paste-geometry": {
        const document = await this.geometry.paste(this.session.store.data, request);
        this.checkCancellation();
        this.session.pendingOperation = null;
        this.session.candidate = null;
        this.session.store.accept(document, operation);
        break;
      }
      case "open": {
        const document = await this.geometry.open(request.document);
        this.checkCancellation();
        this.session.replace(document);
        this.decorators.clear();
        break;
      }
      case "edge-finish-selection":
        await this.solids.selectFinishEdges(this.session.store.data, request.operation);
        break;
      case "accept":
        await this.accept(request.cleanup);
        break;
      case "discard":
        this.session.discard();
        break;
      case "reopen":
      case "undo":
      case "redo":
        this.session.navigate(request.kind);
        break;
      case "navigation-history":
        this.session.store.navigateView(request.direction);
        break;
      case "new":
        this.session.replace();
        this.decorators.clear();
        break;
      case "delete-entities": {
        this.session.pendingOperation = null;
        this.session.candidate = null;
        const document = await this.geometry.delete(this.session.store.data, request);
        this.checkCancellation();
        this.session.store.accept(document, operation);
        break;
      }
      case "read":
        break;
      default:
        throw new Error("Unknown sketch operation");
    }
  }
  close(): void {
    this.queries.close();
    this.solver.close();
    this.kernel.close();
  }
}
