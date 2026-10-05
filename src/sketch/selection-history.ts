import type { SketchEditor } from "./editor.js";
import type { HistoryNavigation, NavigationChange } from "./history-navigation.js";
import {
  emptySelection,
  type HistorySelection,
  type SelectionChanges,
} from "./history-selection.js";

/** Buffers completed UI intent for serialized writes into the owner's history. */
export class SelectionHistory {
  private baseline = emptySelection();
  private steps: SelectionChanges["steps"] = [];
  private latest = emptySelection();
  private settling = false;
  private settleNavigation: (() => void) | undefined;
  private restoring = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private editor: SketchEditor) {}
  connectNavigation(): void {
    const navigation = this.editor.world.navigation;
    navigation.readSelection = () => this.capture();
    navigation.discarded = () => this.expireNavigation();
    navigation.completed = (change: NavigationChange) => {
      if (this.settling) return;
      this.steps.push(change);
      this.latest = structuredClone(change.navigation.after.selection);
      queueMicrotask(() => this.editor.store.syncSelection());
    };
  }
  get navigating(): boolean {
    return this.editor.world.navigation.active;
  }
  finishNavigation(): void {
    this.editor.world.navigation.finish();
    this.editor.world.navigation.withoutRecording(() => this.editor.world.cancelCameraMotion());
  }
  expireNavigation(): void {
    this.steps.push({ expireNavigation: true });
    queueMicrotask(() => this.editor.store.syncSelection());
  }
  get pending(): boolean {
    return this.steps.length > 0;
  }
  private capture(): HistorySelection {
    return structuredClone({
      workspace: this.editor.world.workspace,
      sketch: this.editor.selected.targets,
      modeling: this.editor.modeling.targets,
    });
  }
  observe(): void {
    if (
      this.restoring ||
      this.settling ||
      this.editor.store.busy ||
      this.editor.store.scriptRunning ||
      this.editor.interactions.current
    )
      return;
    const next = this.capture();
    const previous = this.latest;
    if (this.navigating && this.editor.world.navigation.changingWorkspace) {
      this.latest = next;
      return;
    }
    if (
      JSON.stringify([next.sketch, next.modeling]) ===
      JSON.stringify([previous.sketch, previous.modeling])
    ) {
      // Navigation alone is not a selection operation.
      previous.workspace = next.workspace;
      return;
    }
    this.editor.world.navigation.finish(previous);
    this.steps.push(next);
    this.latest = next;
    queueMicrotask(() => this.editor.store.syncSelection());
  }
  take(): SelectionChanges {
    if (this.settling) this.settle();
    this.observe();
    const changes = { baseline: this.baseline, steps: this.steps };
    this.baseline = this.latest;
    this.steps = [];
    return structuredClone(changes);
  }
  accepted(replaced = false): void {
    if (replaced) this.editor.world.navigation.clear();
    this.settleNavigation = replaced ? undefined : this.editor.world.navigation.rebase();
    this.steps = [];
    this.settling = true;
    clearTimeout(this.timer);
    // Let the accepting controller finish its result selection and release its lease.
    this.timer = setTimeout(() => this.settle(), 0);
  }
  private settle(): void {
    clearTimeout(this.timer);
    this.baseline = this.capture();
    this.latest = this.baseline;
    this.settleNavigation?.();
    this.settleNavigation = undefined;
    this.settling = false;
    queueMicrotask(() => this.editor.store.syncSelection());
  }
  restoreNavigation(snapshot: HistoryNavigation): void {
    this.editor.world.navigation.restore(snapshot, (selection) => this.restore(selection));
  }
  restore(selection: HistorySelection): void {
    this.editor.world.navigation.clear();
    this.editor.world.navigation.withoutRecording(() => this.restoreSelection(selection));
  }
  private restoreSelection(selection: HistorySelection): void {
    this.restoring = true;
    try {
      const editor = this.editor;
      const workspace = selection.workspace;
      if (workspace) {
        if (JSON.stringify(workspace) !== JSON.stringify(editor.world.workspace))
          editor.world.enterWorkspace(structuredClone(workspace));
      } else if (editor.world.workspace) editor.world.exit();
      // Workspace entry clears old targets during its draw; restore only afterwards.
      editor.modeling.sync(editor.store.data);
      editor.selectTargets(selection.sketch);
      editor.modeling.targets = structuredClone(selection.modeling);
      editor.tool = "select";
      editor.creationArmed = false;
      editor.modeling.alternatives = [];
      editor.modeling.hover = null;
      editor.refresh();
      this.baseline = this.capture();
      this.latest = this.baseline;
      this.steps = [];
    } finally {
      this.restoring = false;
    }
  }
}
