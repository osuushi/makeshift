import type { DisplayDocument } from "../model/display-document.js";
import { EntityVisibility } from "../model/entity-visibility.js";
import { ActiveInteraction, type InteractionLease } from "./active-interaction.js";
import {
  type Arc,
  type Circle,
  type EditingGroup,
  type Segment,
  type Sketch,
  samePlane,
} from "./document.js";
import { actionIntent, type EditAction } from "./edit-intent.js";
import { editNotice } from "./edit-notice.js";
import { performHistory } from "./editor-history.js";
import { replaceSelection } from "./editor-selection.js";
import { installWorkspaceSync, WorkspaceEntry } from "./editor-workspace.js";
import { ModelClient } from "./model-client.js";
import { modelingSketch } from "./model-selection.js";
import { ModelSelection } from "./model-selection-state.js";
import type { NumericEdit } from "./numeric-edit.js";
import type { Point } from "./planes.js";
import type { PointMenu } from "./point-selection.js";
import type { RectangleHandle } from "./rectangle-edit.js";
import { SelectedTargets } from "./selected-targets.js";
import { SelectionHistory } from "./selection-history.js";
import type { SelectionTarget } from "./selection-target.js";
import { type Hit, hitIds } from "./sketch-hit.js";
import type { World } from "./world.js";

export type Tool = "select" | "rectangle" | "line" | "circle" | "bezier" | "trim";
export class SketchEditor {
  readonly store = new ModelClient(
    () => this.refresh(),
    (message) => {
      this.message = message;
    },
    (operation, direction) => this.visibility.restoreHistory(this.store.data, operation, direction),
  );
  readonly selectionHistory = new SelectionHistory(this);
  readonly visibility = new EntityVisibility();
  bodiesVisible = true;
  readonly modeling = new ModelSelection();
  readonly selected = new SelectedTargets();
  get selectedCurves(): Set<string> {
    return this.selected.wholeCurves(this.sketch);
  }
  selectGroup(id: string): void {
    this.selectTargets([{ kind: "group", group: id }]);
  }
  selectTargets(targets: readonly SelectionTarget[]): void {
    replaceSelection(this, targets);
  }
  get selectionOwners(): Set<string> {
    return new Set([
      ...this.selectedCurves,
      ...this.selected.pointHits(this.sketch).flatMap(hitIds),
    ]);
  }
  moveMode = false;
  tool: Tool = "select";
  selectionAngle = 0;
  circleAngle = 0;
  bowSide: number | null = null;
  transformAxis: "x" | "y" | null = null;
  transformDistance = 0;
  transformRotation = false;
  rotationPreview: number | null = null;
  creationArmed = false;
  pointMenu: PointMenu | null = null;
  pointHover: Hit | null = null;
  constraintHover: string | null = null;
  gridSnap = true;
  pivot: Point | null = null;
  /** Current visible movement widget anchor; shared with bounding-box scaling. */
  transformAnchor: { point: import("./planes.js").Vector; active: boolean } | null = null;
  placingPivot = false;
  hover: Hit | null = null;
  selectionBox: { a: Point; b: Point } | null = null;
  overlaps: { hits: Hit[]; screen: Point } | null = null;
  readonly interactions = new ActiveInteraction(
    () => this.refresh(),
    () => this.world.navigation.unrecorded(),
  );
  readonly workspaceEntry = new WorkspaceEntry(this);
  get candidate(): DisplayDocument | null {
    return this.interactions.candidate;
  }
  message = "";
  notice = "";
  pointer: Point | null = null;
  get isDragging(): boolean {
    return this.interactions.dragging;
  }
  get finishing(): boolean {
    return this.interactions.finishing;
  }
  get blocked(): boolean {
    return this.store.busy || this.store.scriptRunning || this.finishing;
  }
  activeHandle: RectangleHandle | undefined;
  snap: { x: number; y: number; label: string } | null = null;
  constructor(
    readonly world: World,
    readonly numeric: NumericEdit,
  ) {
    world.changed.add(() => {
      this.transformAnchor = null;
    });
    installWorkspaceSync(this);
    this.store.selectionHistory = this.selectionHistory;
    this.selectionHistory.connectNavigation();
    this.world.changed.add(() => this.selectionHistory.observe());
  }

  get display(): DisplayDocument {
    return this.candidate ?? this.store.data;
  }
  get sketch(): Sketch | undefined {
    const workspace = this.world.workspace;
    if (!workspace) return undefined;
    return workspace.sketchId
      ? this.display.sketches.find((s) => s.id === workspace.sketchId)
      : this.display.sketches.find(
          (s) => this.visibility.visible(s.id) && samePlane(s.plane, workspace.frame),
        );
  }
  get mergeableSketches(): Sketch[] {
    if (this.interactions.current?.kind === "projection") return [];
    const selected = modelingSketch(this);
    if (!selected) return [];
    return this.display.sketches.filter(
      (sketch) =>
        sketch.id !== selected.id &&
        this.visibility.visible(sketch.id) &&
        samePlane(sketch.plane, selected.plane),
    );
  }
  get rectangleContext(): EditingGroup | undefined {
    if (!this.selectionOwners.size) return undefined;
    return this.sketch?.groups.find((group) =>
      [...this.selectionOwners].every((id) => group.members.includes(id)),
    );
  }
  select(ids: Iterable<string>): void {
    this.selectTargets([...ids].map((curve) => ({ kind: "curve", curve })));
  }
  refresh(): void {
    const sketch = this.store.data.sketches.find((s) => s.id === this.world.workspace?.sketchId);
    if (sketch) this.world.syncWorkspaceFrame(sketch.plane);
    this.world.draw();
  }
  async setTool(tool: Tool): Promise<void> {
    if (this.blocked || this.isDragging) return;
    await this.numeric.commit();
    if (this.interactions.current?.kind === "numeric") return;
    await this.interactions.cancel();
    this.selected.replacePoints([]);
    this.pointMenu = null;
    this.pointHover = null;
    this.constraintHover = null;
    this.moveMode = false;
    this.tool = tool;
    if (tool === "bezier")
      this.notice = "Drag endpoints, then shape the curve with its tangent handles";
    else this.notice = "";
    this.creationArmed = tool !== "select" && tool !== "trim";
    if (this.creationArmed || tool === "trim") this.select([]);
    if (tool === "trim") this.hover = null;
    this.overlaps = null;
    this.message = "";
    this.refresh();
  }
  async activateMove(): Promise<void> {
    if (!this.selectionOwners.size || this.blocked || this.isDragging) return;
    await this.numeric.commit();
    if (this.interactions.current?.kind === "numeric") return;
    this.tool = "select";
    this.creationArmed = false;
    this.moveMode = true;
    this.pointMenu = null;
    this.transformAxis = null;
    this.transformRotation = false;
    this.refresh();
  }
  get line() {
    if (this.selectionOwners.size !== 1 || this.rectangleContext) return undefined;
    return this.sketch?.curves.find(
      (curve): curve is Segment => curve.kind === "segment" && this.selectionOwners.has(curve.id),
    );
  }
  get arc() {
    if (this.selectionOwners.size !== 1) return undefined;
    return this.sketch?.curves.find(
      (curve): curve is Arc => curve.kind === "arc" && this.selectionOwners.has(curve.id),
    );
  }
  get circle() {
    if (this.selectionOwners.size !== 1) return undefined;
    return this.sketch?.curves.find(
      (curve): curve is Circle => curve.kind === "circle" && this.selectionOwners.has(curve.id),
    );
  }
  async accept(cleanup = false): Promise<boolean> {
    const before = this.store.data;
    const accepted = await this.store.request({ kind: "accept", cleanup });
    if (accepted) this.notice = editNotice(before, this.store.data);
    return accepted;
  }
  async editSketch(
    sketch: Sketch,
    action: EditAction = { kind: "direct" },
    interaction?: InteractionLease,
  ): Promise<boolean> {
    if (this.store.busy || (this.finishing && this.interactions.current !== interaction))
      return false;
    const before = this.store.data;
    const accepted = await this.store.request({
      kind: "edit",
      sketch,
      intent: actionIntent(
        action,
        before.sketches.find((s) => s.id === sketch.id),
        sketch,
      ),
    });
    if (accepted) this.notice = editNotice(before, this.store.data);
    return accepted;
  }
  private clearSelection(): void {
    this.select([]);
    this.pivot = null;
    this.overlaps = null;
    this.activeHandle = undefined;
    this.refresh();
  }
  async history(direction: "undo" | "redo"): Promise<void> {
    await performHistory(this, direction);
  }
  async remove(): Promise<void> {
    if (this.blocked || this.isDragging) return;
    this.numeric.cancel();
    await this.interactions.cancel();
    const sketch = this.sketch;
    if (sketch)
      await this.store.request({
        kind: "remove",
        sketchId: sketch.id,
        ids: [...this.selectionOwners],
      });
    this.clearSelection();
  }
  async clear(): Promise<void> {
    if (this.blocked || this.isDragging) return;
    this.numeric.cancel();
    await this.interactions.cancel();
    const sketch = this.sketch;
    if (sketch) await this.store.request({ kind: "clear", sketchId: sketch.id });
    this.clearSelection();
  }
  async newDocument(): Promise<boolean> {
    if (this.blocked || this.isDragging) return false;
    this.numeric.cancel();
    await this.interactions.cancel();
    if (!(await this.store.request({ kind: "new" }))) return false;
    this.bodiesVisible = true;
    this.visibility.reset();
    this.world.crossSection = null;
    this.clearSelection();
    return true;
  }
  escape(): void {
    if (this.moveMode && !this.isDragging) {
      this.numeric.cancel();
      this.moveMode = false;
      this.transformAxis = null;
      this.transformRotation = false;
      this.refresh();
      return;
    }
    if (this.pointMenu) {
      this.pointMenu = null;
      this.pointHover = null;
      this.constraintHover = null;
      this.refresh();
      return;
    }
    this.bowSide = null;
    this.overlaps = null;
    if (this.placingPivot) {
      this.placingPivot = false;
      this.refresh();
      return;
    }
    this.creationArmed = false;
    if (this.interactions.requestCancel()) {
      this.refresh();
      return;
    }
    if (this.tool !== "select" || this.selectionOwners.size) {
      this.tool = "select";
      this.selected.replace([]);
      this.activeHandle = undefined;
    } else this.world.exit();
    this.message = "";
    this.refresh();
  }
}
