import { sketchGridPreferences } from "../preferences/sketch-grid.js";
import { cancellableCalculation } from "./calculation-state.js";
import type { ModelRequest, ModelView } from "./model-api.js";
import { ModelQueries } from "./model-queries.js";
import { call } from "./model-transport.js";
import type { HistoryOperation, OperationHistoryEntry } from "./operation-history.js";
import { retainViewSketches } from "./retain-view-sketches.js";
import type { SelectionHistory } from "./selection-history.js";

// A read-only rendering copy. Accepted edits and all Undo snapshots live in the host.
export class ModelClient extends ModelQueries {
  private view: ModelView = {
    data: { units: "mm", sketches: [] },
    canUndo: false,
    canRedo: false,
    candidate: null,
    solveCount: 0,
    solveMs: 0,
  };
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
  constructor(
    private changed: () => void,
    private error: (message: string) => void,
    private navigated?: (operation: HistoryOperation, direction: "undo" | "redo") => void,
  ) {
    super();
  }
  get planeCutAvailable() {
    return this.view.planeCutAvailable ?? false;
  }
  get cleanupAvailable() {
    return this.view.cleanupAvailable ?? false;
  }
  get edgeSelection() {
    return this.view.edgeSelection ?? [];
  }
  get offsetDistance() {
    return this.view.offsetDistance;
  }
  get offsetSelection() {
    return this.view.offsetSelection;
  }
  get erosionQuality() {
    return this.view.erosionQuality;
  }
  get meshFit() {
    return this.view.meshFit;
  }
  get edgeSize() {
    return this.view.edgeSize;
  }
  get data() {
    return this.view.data;
  }
  get decoratorSources() {
    return this.view.decoratorSources ?? [];
  }
  get reopenOperation() {
    return this.view.reopenOperation;
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
  get canUndoView(): boolean {
    return !!this.view.canUndoView;
  }
  get canRedoView(): boolean {
    return !!this.view.canRedoView;
  }
  get booleanTargets() {
    return this.view.booleanTargets ?? [];
  }
  get booleanTools() {
    return this.view.booleanTools ?? [];
  }
  get booleanMode() {
    return this.view.booleanMode;
  }
  get cutEdges() {
    return this.view.cutEdges ?? [];
  }
  get visualPreview() {
    return this.view.visualPreview;
  }
  get candidate() {
    return this.view.candidate;
  }
  get statistics() {
    return { count: this.view.solveCount, milliseconds: this.view.solveMs };
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
  async request(request: ModelRequest): Promise<boolean> {
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
    this.busy = true;
    this.changed();
    this.waiting = this.send(request);
    return this.waiting;
  }
  private async send(request: ModelRequest): Promise<boolean> {
    const timer = setTimeout(() => {
      this.slow = true;
      this.changed();
    }, 500);
    try {
      await this.selectionSending;
      await this.flushSelection();
      const direction =
        request.kind === "reopen"
          ? "undo"
          : request.kind === "navigation-history"
            ? request.direction
            : request.kind === "undo" || request.kind === "redo"
              ? request.kind
              : null;
      if (this.cancelling || this.interrupted) return false;
      let reply = await call(request);
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
    } catch (error) {
      if (
        !this.cancelling &&
        !(this.superseding && error instanceof Error && error.message === "Preview superseded")
      )
        this.error(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      // Drain the control message before another calculation can occupy the slot.
      await this.superseding;
      this.superseding = null;
      this.interrupted = false;
      clearTimeout(timer);
      this.slow = false;
      this.working = false;
      this.calculation = undefined;
      this.busy = this.cancelling;
      this.changed();
    }
  }
  supersedePreview(interrupt = false): void {
    if (!this.working || this.superseding || this.cancelling) return;
    this.interrupted = interrupt;
    this.superseding = call({ kind: "supersede-preview", interrupt }).catch(() => undefined);
  }
  async cancelPreview(): Promise<void> {
    if (this.cancelling) return;
    this.cancelling = true;
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
