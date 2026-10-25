import type { ModelRequest } from "../sketch/model-api.js";
import type { HistoryOperation } from "../sketch/operation-history.js";
import type { DecoratorSession } from "./decorator-session.js";
import { DocumentGeometry } from "./document-geometry.js";
import type { DocumentSession } from "./document-session.js";
import type { SolidCalculator } from "./solid-calculator.js";
import type { SolidEdits } from "./solid-edits.js";

/** Ordinary document commands share the owner's serial edit/publication boundary. */
export class DocumentCommands {
  cleanupAvailable = false;
  private geometry: DocumentGeometry;
  constructor(
    private session: DocumentSession,
    private solids: SolidEdits,
    kernel: SolidCalculator,
    private decorators: DecoratorSession,
    private accept: (cleanup?: boolean) => Promise<void>,
    private checkCancellation: () => void,
  ) {
    this.geometry = new DocumentGeometry(kernel, solids, decorators);
  }
  async run(request: ModelRequest, operation: HistoryOperation): Promise<void> {
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
}
