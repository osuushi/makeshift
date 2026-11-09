import type { VisualPreview } from "../model/visual-preview.js";
import type { SketchDocument } from "../sketch/document.js";
import type { ModelRequest } from "../sketch/model-api.js";
import { describeOperation, type HistoryOperation } from "../sketch/operation-history.js";
import type { DeferredEditRequest } from "./deferred-edit.js";
import { DocumentStore } from "./document-store.js";
import type { ReopenPreview } from "./reopen-preview.js";

type PreviewState =
  | { kind: "idle" }
  | { kind: "preparing"; operation: HistoryOperation }
  | { kind: "completing"; operation: HistoryOperation; visual: VisualPreview }
  | {
      kind: "visual";
      operation: HistoryOperation;
      visual: VisualPreview;
      edit: DeferredEditRequest | null;
    }
  | {
      kind: "complete";
      operation: HistoryOperation;
      document: SketchDocument;
      reopened: ReopenPreview | null;
    };

/** Only this session transitions temporary work; the store owns accepted data. */
export class DocumentSession {
  store = new DocumentStore();
  solveCount = 0;
  solveMs = 0;
  private state: PreviewState = { kind: "idle" };

  get pendingOperation(): HistoryOperation | null {
    return this.state.kind === "idle" ? null : this.state.operation;
  }
  get candidate(): SketchDocument | null {
    return this.state.kind === "complete" ? this.state.document : null;
  }
  get visualPreview(): VisualPreview | undefined {
    return this.state.kind === "visual" || this.state.kind === "completing"
      ? this.state.visual
      : undefined;
  }
  get deferredEdit(): DeferredEditRequest | null {
    return this.state.kind === "visual" ? this.state.edit : null;
  }
  get reopenedPreview(): ReopenPreview | null {
    return this.state.kind === "complete" ? this.state.reopened : null;
  }
  begin(operation: HistoryOperation): void {
    this.state = { kind: "preparing", operation };
  }
  drawable(
    visual: VisualPreview,
    edit: DeferredEditRequest | null,
    operation: HistoryOperation,
  ): void {
    this.state = { kind: "visual", visual, edit, operation };
  }
  beginCompletion(): DeferredEditRequest {
    if (this.state.kind !== "visual" || !this.state.edit)
      throw new Error("No preview presentation to complete");
    const { edit, operation, visual } = this.state;
    this.state = { kind: "completing", operation, visual };
    return edit;
  }
  complete(document: SketchDocument, operation = this.pendingOperation): void {
    if (!operation) throw new Error("No pending edit to complete");
    this.state = { kind: "complete", document, operation, reopened: null };
  }
  /** Decorator continuation and cleanup refine complete work without accepting it. */
  refine(document: SketchDocument, preserveReopened = true): void {
    if (this.state.kind !== "complete") throw new Error("No complete edit to refine");
    this.state = {
      ...this.state,
      document,
      reopened: preserveReopened ? this.state.reopened : null,
    };
  }
  /** A different command invalidates a mesh-only result but can inspect a complete edit. */
  leavePresentation(preserveReopened: boolean): void {
    if (this.state.kind === "visual" || this.state.kind === "completing")
      this.begin(this.state.operation);
    if (!preserveReopened && this.state.kind === "complete")
      this.state = { ...this.state, reopened: null };
  }
  preview(result: { count: number; ms: number; document: SketchDocument }): void {
    this.solveCount += result.count;
    if (result.count) this.solveMs = result.ms;
    this.complete(result.document);
  }
  operation(request: ModelRequest): HistoryOperation {
    const operation =
      request.kind === "accept" || request.kind === "complete-preview"
        ? (this.pendingOperation ?? describeOperation(request))
        : describeOperation(request);
    return request.kind === "accept" && request.cleanup
      ? { ...operation, parameters: { ...operation.parameters, cleanup: true } }
      : operation;
  }
  clearPreview(): void {
    this.state = { kind: "idle" };
  }
  discard(): void {
    if (this.pendingOperation) this.store.record(this.pendingOperation, "cancelled");
    this.clearPreview();
  }
  accept(cleanup: boolean, preview: ReopenPreview): void {
    if (this.state.kind !== "complete") throw new Error("No valid edit to accept");
    const { document, operation } = this.state;
    this.store.accept(
      document,
      {
        ...operation,
        ...(cleanup ? { parameters: { ...operation.parameters, cleanup: true } } : {}),
      },
      preview,
    );
    this.clearPreview();
  }
  replace(document?: SketchDocument): void {
    this.store = new DocumentStore(document);
    this.clearPreview();
  }
  navigate(direction: "reopen" | "undo" | "redo"): void {
    if (direction === "reopen") {
      if (this.state.kind !== "idle") throw new Error("Finish the current edit first");
      const restored = this.store.reopen();
      this.state = {
        kind: "complete",
        document: restored.candidate,
        operation: this.store.restoredOperation ?? describeOperation({ kind: "accept" }),
        reopened: restored.preview ?? {},
      };
    } else {
      this.clearPreview();
      this.store[direction]();
    }
  }
}
