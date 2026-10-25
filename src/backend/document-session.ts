import type { SketchDocument } from "../sketch/document.js";
import type { ModelRequest } from "../sketch/model-api.js";
import { describeOperation, type HistoryOperation } from "../sketch/operation-history.js";
import { DocumentStore } from "./document-store.js";
import type { ReopenPreview } from "./reopen-preview.js";

/** The accepted store and temporary preview state belonging to one document owner. */
export class DocumentSession {
  store = new DocumentStore();
  solveCount = 0;
  solveMs = 0;
  pendingOperation: HistoryOperation | null = null;
  candidate: SketchDocument | null = null;
  visualPreview: import("../model/visual-preview.js").VisualPreview | undefined;
  reopenedPreview: ReopenPreview | null = null;

  preview(result: { count: number; ms: number; document: SketchDocument }): void {
    this.solveCount += result.count;
    if (result.count) this.solveMs = result.ms;
    this.candidate = result.document;
  }
  operation(request: ModelRequest): HistoryOperation {
    const operation =
      request.kind === "accept"
        ? (this.pendingOperation ?? describeOperation(request))
        : describeOperation(request);
    return request.kind === "accept" && request.cleanup
      ? { ...operation, parameters: { ...operation.parameters, cleanup: true } }
      : operation;
  }
  clearPreview(): void {
    this.candidate = null;
    this.visualPreview = undefined;
    this.pendingOperation = null;
    this.reopenedPreview = null;
  }
  discard(): void {
    if (this.pendingOperation) this.store.record(this.pendingOperation, "cancelled");
    this.pendingOperation = null;
    this.candidate = null;
    this.visualPreview = undefined;
  }
  accept(cleanup: boolean, preview: ReopenPreview): void {
    if (!this.candidate) throw new Error("No valid edit to accept");
    this.store.accept(
      this.candidate,
      {
        ...(this.pendingOperation ?? describeOperation({ kind: "accept" })),
        ...(cleanup ? { parameters: { ...this.pendingOperation?.parameters, cleanup: true } } : {}),
      },
      preview,
    );
    this.clearPreview();
  }
  replace(document?: SketchDocument): void {
    this.reopenedPreview = null;
    this.store = new DocumentStore(document);
    this.pendingOperation = null;
    this.candidate = null;
    this.visualPreview = undefined;
  }
  navigate(direction: "reopen" | "undo" | "redo"): void {
    if (direction === "reopen") {
      if (this.candidate || this.visualPreview) throw new Error("Finish the current edit first");
      const restored = this.store.reopen();
      this.candidate = restored.candidate;
      this.pendingOperation = this.store.restoredOperation ?? null;
      this.reopenedPreview = restored.preview ?? {};
    } else {
      this.pendingOperation = null;
      this.candidate = null;
      this.visualPreview = undefined;
      this.store[direction]();
    }
  }
}
