import type { VisualPreview } from "../model/visual-preview.js";
import { sketchGridPreferences } from "../preferences/sketch-grid.js";
import { cancellableCalculation } from "./calculation-state.js";
import { DeferredPreview } from "./deferred-preview.js";
import type { ModelReply, ModelRequest, ModelView } from "./model-api.js";
import { ModelQueries } from "./model-queries.js";
import { call } from "./model-transport.js";
import type { HistoryOperation, OperationHistoryEntry } from "./operation-history.js";
import { retainViewSketches } from "./retain-view-sketches.js";
import type { SelectionHistory } from "./selection-history.js";

// A read-only rendering copy. Accepted edits and all Undo snapshots live in the host.
export class ModelClient extends ModelQueries {
  selectionHistory?: SelectionHistory;
  private selectionSending: Promise<void> | null = null;
  private selectionInFlight = false;
  private initialized = false;
  lastEdit: ModelRequest | null = null;
  erosionAllowance: number | undefined;
  scriptRunning = false;
  scriptState(running: boolean, view?: ModelView): void {
    this.scriptRunning = running;
    if (view) {
      const changed = JSON.stringify(this.view.data) !== JSON.stringify(view.data);
      this.view = retainViewSketches(this.view, view);
      if (changed) this.selectionHistory?.accepted();
    }
    this.changed();
  }
  busy = true;
  working = false;
  slow = false;
  calculation: ModelRequest["kind"] | undefined;
  started = 0;
  get canCancel(): boolean {
    return (
      this.working &&
      !this.cancelling &&
      !!this.calculation &&
      cancellableCalculation(this.calculation)
    );
  }
  private cancelling = false;
  private superseding: Promise<unknown> | null = null;
  private interrupted = false;
  private waiting: Promise<boolean> = Promise.resolve(true);
  private presentation: DeferredPreview | null = null;
  constructor(
    private changed: () => void,
    private error: (message: string) => void,
    private navigated?: (operation: HistoryOperation, direction: "undo" | "redo") => void,
  ) {
    super();
  }
  get canUndo() {
    return (
      this.selectionInFlight ||
      !!this.selectionHistory?.pending ||
      !!this.selectionHistory?.navigating ||
      this.view.canUndo
    );
  }
  get canRedo() {
    return (
      !this.selectionInFlight &&
      !this.selectionHistory?.pending &&
      !this.selectionHistory?.navigating &&
      this.view.canRedo
    );
  }
  syncSelection(): void {
    if (this.selectionSending || this.working || this.busy || this.scriptRunning) return;
    this.selectionInFlight = !!this.selectionHistory?.pending;
    this.selectionSending = this.flushSelection()
      .catch((error: unknown) => this.error(error instanceof Error ? error.message : String(error)))
      .finally(() => {
        this.selectionSending = null;
        this.selectionInFlight = false;
        this.changed();
        if (this.selectionHistory?.pending) this.syncSelection();
      });
  }
  private async flushSelection(): Promise<void> {
    if (!this.selectionHistory || !this.initialized) return;
    const reply = await call({ kind: "selection", changes: this.selectionHistory.take() });
    if (reply.error) throw new Error(reply.error);
    this.view = retainViewSketches(this.view, reply.view);
  }
  async history(): Promise<OperationHistoryEntry[]> {
    if (!this.working && this.selectionHistory) await this.request({ kind: "read" });
    return this.readHistory();
  }
  private async readHistory(): Promise<OperationHistoryEntry[]> {
    const reply = await call({ kind: "read-history" });
    if (reply.error) throw new Error(reply.error);
    return reply.history ?? [];
  }
  private restoringReopen: ModelRequest["kind"] | null = null;
  async restoreReopen(kind: ModelRequest["kind"], restore: () => Promise<void>): Promise<void> {
    this.restoringReopen = kind;
    try {
      await restore();
    } finally {
      this.restoringReopen = null;
    }
  }
  async request(
    request: ModelRequest,
    showVisual?: (preview: VisualPreview) => void,
  ): Promise<boolean> {
    // Controllers seed their ordinary local preview state from the accepted owner snapshot.
    if (this.restoringReopen) {
      if ([this.restoringReopen, "check-cleanup", "discard"].includes(request.kind)) return true;
      throw new Error("Unexpected request while restoring accepted operation");
    }
    if (this.working || this.cancelling || this.scriptRunning) return false;
    if (
      ![
        "read",
        "sketch-grid",
        "accept",
        "complete-preview",
        "discard",
        "undo",
        "redo",
        "reopen",
        "navigation-history",
        "check-cleanup",
        "check-plane-cut",
      ].includes(request.kind)
    )
      this.lastEdit = request;
    this.working = true;
    this.erosionAllowance = undefined;
    this.calculation = request.kind;
    this.started = performance.now();
    this.presentation =
      "presentation" in request && request.presentation === "deferred"
        ? new DeferredPreview()
        : null;
    this.busy = true;
    this.changed();
    this.waiting = this.send(request, showVisual);
    return this.waiting;
  }
  private async send(
    request: ModelRequest,
    showVisual?: (preview: VisualPreview) => void,
  ): Promise<boolean> {
    const timer = setTimeout(() => {
      this.slow = true;
      this.changed();
    }, 500);
    try {
      await this.selectionSending;
      await this.flushSelection();
      if (this.cancelling || this.interrupted) return false;
      let reply = this.presentation
        ? await this.presentation.run(request, call, (visual) => {
            this.view = retainViewSketches(this.view, visual.view);
            if (visual.view.visualPreview) showVisual?.(visual.view.visualPreview);
            this.changed();
          })
        : await call(request);
      if (
        !reply.error &&
        !reply.view.data.sketchGrid &&
        ["read", "new", "open"].includes(request.kind)
      )
        reply = await call({
          kind: "sketch-grid",
          grid: sketchGridPreferences().grid,
          initialize: true,
        });
      if (this.interrupted) return false;
      return this.receive(request, reply);
    } catch (error) {
      if (
        !this.cancelling &&
        !this.presentation?.superseded &&
        !(this.superseding && error instanceof Error && error.message === "Preview superseded")
      )
        this.error(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      // Drain the control message before another calculation can occupy the slot.
      await this.superseding;
      this.superseding = null;
      this.interrupted = false;
      this.presentation = null;
      clearTimeout(timer);
      this.slow = false;
      this.working = false;
      this.calculation = undefined;
      this.busy = this.cancelling;
      this.changed();
    }
  }
  private receive(request: ModelRequest, reply: ModelReply): boolean {
    const direction =
      request.kind === "reopen"
        ? "undo"
        : request.kind === "navigation-history"
          ? request.direction
          : request.kind === "undo" || request.kind === "redo"
            ? request.kind
            : null;
    this.view = retainViewSketches(this.view, reply.view);
    this.erosionAllowance = reply.erosionAllowance;
    if (reply.error) throw new Error(reply.error);
    if (direction && reply.view.historyOperation)
      this.navigated?.(reply.view.historyOperation, direction);
    const selection = reply.view.historySelection;
    if (direction && reply.view.historyNavigation)
      this.selectionHistory?.restoreNavigation(reply.view.historyNavigation);
    else if (
      selection &&
      (direction || (!this.initialized && (selection.sketch.length || selection.modeling.length)))
    )
      this.selectionHistory?.restore(selection);
    else if (
      request.kind === "new" ||
      request.kind === "open" ||
      (reply.documentChanged && request.kind !== "sketch-grid")
    )
      this.selectionHistory?.accepted(request.kind === "new" || request.kind === "open");
    this.initialized = true;
    this.error("");
    return true;
  }
  supersedePreview(interrupt = false): void {
    if (!this.working || this.superseding || this.cancelling) return;
    if (this.presentation) {
      interrupt = this.presentation.supersede();
    }
    this.interrupted = interrupt;
    this.superseding = call({ kind: "supersede-preview", interrupt }).catch(() => undefined);
  }
  async cancelPreview(): Promise<void> {
    if (this.cancelling) return;
    this.cancelling = true;
    this.presentation?.supersede();
    try {
      const reply = await call({ kind: "cancel-preview" });
      await this.waiting;
      this.view = retainViewSketches(this.view, reply.view);
      this.error(reply.error ?? "");
    } catch (error) {
      this.error(error instanceof Error ? error.message : String(error));
    } finally {
      this.cancelling = false;
      this.busy = false;
      this.changed();
    }
  }
  async documentReplaced(): Promise<void> {
    await this.selectionSending;
    this.initialized = false;
    this.selectionHistory?.accepted(true);
    await this.request({ kind: "read" });
    this.selectionHistory?.accepted(true);
  }
  async settled(): Promise<void> {
    await this.waiting;
    await this.selectionSending;
  }
}
