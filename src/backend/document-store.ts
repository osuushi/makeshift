import type { SketchDocument } from "../sketch/document.js";
import type { HistoryNavigation, NavigationChange } from "../sketch/history-navigation.js";
import {
  emptySelection,
  type HistorySelection,
  type SelectionChanges,
} from "../sketch/history-selection.js";
import type { HistoryOperation, OperationHistoryEntry } from "../sketch/operation-history.js";

import { reopenOperation } from "../sketch/reopen-operation.js";

import { validateDocument } from "./document-validation.js";

interface HistoryRecord {
  entry: OperationHistoryEntry;
  change?: { before: SketchDocument; after: SketchDocument };
  selection?: { before: HistorySelection; after: HistorySelection };
  // Standalone selections share their accepted snapshot; no document copy or owner.
  selectionDocument?: SketchDocument;
  navigation?: NavigationChange["navigation"];
}

/** One attempted-operation history. Only entries with an active change navigate. */
export class DocumentStore {
  constructor(private accepted: SketchDocument = { units: "mm", sketches: [] }) {
    validateDocument(accepted);
  }
  private records: HistoryRecord[] = [];
  private nextId = 1;
  selection = emptySelection();
  restoredNavigation?: HistoryNavigation;
  restoredOperation?: HistoryOperation;
  selections(changes: SelectionChanges): void {
    const latest = [...this.records].reverse().find((r) => r.entry.state === "applied");
    this.selection = structuredClone(changes.baseline);
    if (latest?.selection && !latest.navigation) latest.selection.after = this.selection;
    for (const next of changes.steps) {
      if ("navigation" in next) {
        this.navigate(next);
        continue;
      }
      if (JSON.stringify(next) === JSON.stringify(this.selection)) continue;
      this.expireNavigation();
      this.supersede(false);
      const after = structuredClone(next);
      this.records.push({
        entry: {
          ...this.entry({ kind: "selection", parameters: {} }, "changed"),
          state: "applied",
        },
        selection: { before: this.selection, after },
        selectionDocument: this.accepted,
      });
      this.selection = after;
    }
  }
  private expireNavigation(): void {
    this.records = this.records.filter((record) => !record.navigation);
  }
  private navigate(change: NavigationChange): void {
    const { before, after } = change.navigation;
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    this.expireNavigation();
    this.records.push({
      entry: { ...this.entry({ kind: "navigation", parameters: {} }, "changed"), state: "applied" },
      navigation: structuredClone(change.navigation),
      selection: {
        before: structuredClone(before.selection),
        after: structuredClone(after.selection),
      },
      selectionDocument: this.accepted,
    });
    this.selection = structuredClone(after.selection);
  }
  private supersede(geometry = true): void {
    for (const record of this.records) {
      if (record.entry.state !== "undone" || (!geometry && record.change)) continue;
      record.entry.state = "superseded";
      delete record.navigation;
      delete record.change;
      delete record.selection;
      delete record.selectionDocument;
    }
  }
  get data(): SketchDocument {
    return this.accepted;
  }
  get history(): OperationHistoryEntry[] {
    return structuredClone(this.records.map((record) => record.entry));
  }
  private get latestChange(): HistoryRecord | undefined {
    return [...this.records]
      .reverse()
      .find((record) => record.change && record.entry.state === "applied");
  }
  get reopenOperation() {
    const record = this.latestChange;
    return record?.change?.after === this.accepted
      ? reopenOperation(record.entry.operation)
      : undefined;
  }
  reopen(): void {
    const record = this.latestChange;
    if (!record?.change || !this.reopenOperation)
      throw new Error("The latest accepted edit cannot be reopened");
    this.expireNavigation();
    for (const selection of this.records) {
      if (!selection.selectionDocument) continue;
      selection.entry.state = "superseded";
      delete selection.selection;
      delete selection.selectionDocument;
    }
    this.restoredNavigation = undefined;
    this.restoredOperation = record.entry.operation;
    this.accepted = record.change.before;
    if (record.selection) this.selection = structuredClone(record.selection.before);
    record.entry.state = "undone";
  }
  get canUndo(): boolean {
    return this.records.some((record) => record.entry.state === "applied");
  }
  get canRedo(): boolean {
    return this.records.some((record) => record.entry.state === "undone");
  }
  record(
    operation: HistoryOperation,
    outcome: "noop" | "failed" | "cancelled",
    error?: string,
  ): void {
    this.records.push({ entry: this.entry(operation, outcome, error) });
  }
  accept(
    candidate: SketchDocument,
    operation: HistoryOperation = { kind: "accept", parameters: {} },
  ): boolean {
    validateDocument(candidate);
    if (JSON.stringify(candidate) === JSON.stringify(this.accepted)) {
      this.record(operation, "noop");
      return false;
    }
    this.expireNavigation();
    this.supersede();
    for (const record of this.records) {
      if (record.entry.operation.kind !== "selection") continue;
      record.entry.state = "superseded";
      delete record.selection;
      delete record.selectionDocument;
    }
    this.records.push({
      entry: { ...this.entry(operation, "changed"), state: "applied" },
      change: { before: this.accepted, after: candidate },
      selection: { before: this.selection, after: this.selection },
    });
    this.accepted = candidate;
    return true;
  }
  undo(): void {
    this.restoredNavigation = undefined;
    this.restoredOperation = undefined;
    const record = [...this.records].reverse().find((record) => record.entry.state === "applied");
    if (!record?.navigation) this.expireNavigation();
    if (!record) return;
    this.restoredOperation = record.entry.operation;
    this.restoredNavigation = record.navigation?.before;
    if (record.change) this.accepted = record.change.before;
    if (record.selection) this.selection = record.selection.before;
    record.entry.state = "undone";
  }
  redo(): void {
    this.restoredNavigation = undefined;
    this.restoredOperation = undefined;
    // Selection navigation stays at its geometry state until its suffix is replayed.
    const record =
      this.records.find((record) => record.navigation && record.entry.state === "undone") ??
      this.records.find(
        (record) => record.entry.state === "undone" && record.selectionDocument === this.accepted,
      ) ??
      this.records.find((record) => record.entry.state === "undone");
    if (!record?.navigation) this.expireNavigation();
    if (!record) return;
    this.restoredOperation = record.entry.operation;
    this.restoredNavigation = record.navigation?.after;
    if (record.change) {
      // Intervening selections describe the pre-Redo document. The restored
      // operation's own result selection is authoritative in its new geometry.
      for (const selection of this.records) {
        if (!selection.selectionDocument || selection.entry.state !== "applied") continue;
        selection.entry.state = "superseded";
        delete selection.selection;
        delete selection.selectionDocument;
      }
      this.accepted = record.change.after;
    }
    if (record.selection) this.selection = record.selection.after;
    record.entry.state = "applied";
  }
  private entry(
    operation: HistoryOperation,
    outcome: OperationHistoryEntry["outcome"],
    error?: string,
  ): OperationHistoryEntry {
    return {
      id: this.nextId++,
      timestamp: new Date().toISOString(),
      operation: structuredClone(operation),
      outcome,
      state: null,
      ...(error ? { error } : {}),
    };
  }
}
