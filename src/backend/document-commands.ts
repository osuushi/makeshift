import { type BenchEdit, type Drawing, singleBench } from "../model/benches.js";
import { operationCleanup } from "../model/cleanup.js";
import type { SmartObjectEdit } from "../model/smart-object.js";
import type { ModelRequest, ModelView } from "../sketch/model-api.js";
import type { HistoryOperation } from "../sketch/operation-history.js";
import type { Vector } from "../sketch/planes.js";
import { cutEdgeHighlights } from "./cut-edge-highlights.js";
import type { DecoratorSession } from "./decorator-session.js";
import { DocumentGeometry } from "./document-geometry.js";
import type { DocumentSession } from "./document-session.js";
import { planeCutAvailable } from "./plane-cut.js";
import type { ReopenProfile } from "./profile-draft.js";
import { reopenPreview } from "./reopen-preview.js";
import { editSmartObjects } from "./smart-object-edit.js";
import type { SolidCalculator } from "./solid-calculator.js";
import type { SolidEdits } from "./solid-edits.js";

/** Ordinary document commands share the owner's serial edit/publication boundary. */
export class DocumentCommands {
  cleanupAvailable = false;
  planeCutAvailable = false;
  private geometry: DocumentGeometry;
  constructor(
    private session: DocumentSession,
    private solids: SolidEdits,
    private kernel: SolidCalculator,
    private decorators: DecoratorSession,
    private view: () => ModelView,
    private checkCancellation: () => void,
  ) {
    this.geometry = new DocumentGeometry(kernel, solids, decorators);
  }

  async accept(cleanup = false, profile?: ReopenProfile): Promise<void> {
    const { session } = this;
    if (!session.candidate) throw new Error("No valid edit to accept");
    if (
      cleanup &&
      (!session.reopenedPreview || session.pendingOperation?.parameters.cleanup !== true)
    ) {
      session.refine(
        await this.solids.removeTopology(
          session.candidate,
          operationCleanup(session.store.data.bodies ?? [], session.candidate.bodies ?? []),
        ),
        false,
      );
    }
    const feedback = this.view().cutEdges;
    if (!session.reopenedPreview)
      session.refine(await this.decorators.continue(session.candidate, session.store.data));
    if (feedback) cutEdgeHighlights.set(session.candidate, feedback);
    this.checkCancellation();
    session.accept(cleanup, reopenPreview(this.view(), profile));
  }

  private editBench(edit: BenchEdit): void {
    const benches = this.session.benches;
    const previous = benches.editing;
    benches.edit(edit);
    this.changedBench(previous);
  }
  async editSmartObject(
    edit: SmartObjectEdit,
    operation: HistoryOperation,
  ): Promise<Vector | undefined> {
    const benches = this.session.benches;
    const previous = benches.editing;
    const origin = await editSmartObjects(
      benches,
      this.kernel,
      edit,
      operation,
      this.checkCancellation,
    );
    this.changedBench(previous);
    return origin;
  }
  private changedBench(previous: string): void {
    const editing = this.session.benches.editing;
    if (editing === previous) return;
    this.decorators.switchBench(editing);
    this.solids.resetPreviewFeedback();
    this.cleanupAvailable = false;
    this.planeCutAvailable = false;
  }
  private async open(source: Drawing): Promise<void> {
    const drawing = await this.geometry.open(source);
    this.checkCancellation();
    this.replace(drawing);
  }
  private replace(drawing?: Drawing): void {
    this.session.replace(drawing);
    this.decorators.clear(drawing?.activeBench);
  }
  async run(request: ModelRequest, operation: HistoryOperation): Promise<void> {
    switch (request.kind) {
      case "bench":
        this.editBench(request.edit);
        break;
      case "check-plane-cut":
        this.planeCutAvailable = await planeCutAvailable(
          this.session.store.data,
          request.operation,
          this.kernel,
        );
        break;
      case "check-cleanup":
        if (this.session.candidate && !this.session.reopenedPreview)
          this.cleanupAvailable = await this.solids.checkCleanup(
            this.session.store.data,
            this.session.candidate,
          );
        break;
      case "cleanup":
      case "delete-topology":
        this.session.begin(operation);
        this.session.complete(
          await this.solids.removeTopology(
            this.session.store.data,
            request.selection,
            request.kind,
          ),
        );
        if (request.kind === "delete-topology") await this.accept();
        break;
      case "paste-geometry": {
        const document = await this.geometry.paste(this.session.store.data, request);
        this.checkCancellation();
        this.session.clearPreview();
        this.session.store.accept(document, operation);
        break;
      }
      case "open":
        await this.open("drawing" in request ? request.drawing : singleBench(request.document));
        break;
      case "restore-decorators":
        await this.decorators.restoreSaved(
          this.session.benches.snapshot(),
          this.session.store.data,
        );
        break;
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
        this.replace();
        break;
      case "delete-entities": {
        this.session.clearPreview();
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
}
