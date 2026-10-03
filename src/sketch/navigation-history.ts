import { captureCamera, restoreCamera } from "../model/camera-state.js";
import {
  type HistoryNavigation,
  type NavigationChange,
  sameNavigation,
} from "./history-navigation.js";
import { emptySelection, type HistorySelection } from "./history-selection.js";
import type { World } from "./world.js";

/** One unfinished gesture, not an Undo stack. Completed intents use the owner's history. */
export class NavigationHistory {
  private before: HistoryNavigation | null = null;
  private holds = new Set<string>();
  private suppressed = 0;
  private scheduled = false;
  changingWorkspace = false;
  stopCompletion: () => void = () => {};
  readSelection: () => HistorySelection = () => ({
    ...emptySelection(),
    workspace: this.world.workspace,
  });
  completed: (change: NavigationChange) => void = () => {};
  constructor(private world: World) {}
  get active(): boolean {
    return this.before !== null;
  }
  get dragging(): boolean {
    return this.world.orbit.active || this.holds.has("pan") || this.holds.has("touch");
  }
  private capture(): HistoryNavigation {
    return structuredClone({ camera: captureCamera(this.world), selection: this.readSelection() });
  }
  begin(): void {
    if (this.suppressed || this.before) return;
    this.before = this.capture();
  }
  beginWorkspace(): void {
    if (this.suppressed) return;
    this.begin();
    this.changingWorkspace = true;
    queueMicrotask(() => {
      this.changingWorkspace = false;
    });
  }
  rebase(): void {
    if (this.before) this.before = this.capture();
  }
  hold(kind: string): void {
    this.begin();
    if (!this.suppressed) this.holds.add(kind);
  }
  release(kind: string): void {
    this.holds.delete(kind);
    this.settled();
  }
  settled(): void {
    if (!this.before || this.suppressed || this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      if (!this.holds.size && !this.world.orbit.active && !this.world.cameraTransitioning)
        this.finish();
    });
  }
  finish(selection?: HistorySelection): void {
    const before = this.before;
    if (!before || this.suppressed) return;
    const after = this.capture();
    if (selection) after.selection = structuredClone(selection);
    this.clear();
    if (!sameNavigation(before, after)) this.completed({ navigation: { before, after } });
  }
  clear(): void {
    this.before = null;
    this.holds.clear();
    this.world.cancelCameraMotion();
    this.stopCompletion();
  }
  withoutRecording(action: () => void): void {
    this.suppressed++;
    try {
      action();
    } finally {
      this.suppressed--;
    }
  }
  restore(
    snapshot: HistoryNavigation,
    restoreSelection: (selection: HistorySelection) => void,
  ): void {
    this.clear();
    this.withoutRecording(() => {
      restoreSelection(snapshot.selection);
      restoreCamera(this.world, snapshot.camera);
    });
  }
}
