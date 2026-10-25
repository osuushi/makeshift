import { EdgeFinishTargetClient } from "./edge-finish-target-client.js";
import type { ModelView } from "./model-api.js";
import { call } from "./model-transport.js";

/** Read-only view access and backend queries, outside the document edit slot. */
export class ModelQueries {
  private edgeTargets = new EdgeFinishTargetClient(call);
  protected view: ModelView = {
    data: { units: "mm", sketches: [] },
    canUndo: false,
    canRedo: false,
    candidate: null,
    solveCount: 0,
    solveMs: 0,
  };
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

  async edgeFinishTargets(
    operation: Omit<import("../model/body.js").BodyEdgeFinish, "size">,
    points: import("./planes.js").Vector[],
    signal?: AbortSignal,
  ) {
    return this.edgeTargets.query(operation, points, signal);
  }
  async sections(frame: import("./planes.js").PlaneFrame, bodies: string[]) {
    const reply = await call({ kind: "sections", frame, bodies });
    if (reply.error) throw new Error(reply.error);
    if (!reply.sections) throw new Error("Cross sections unavailable");
    return reply.sections;
  }
  async exportGeometry(bodyIds?: string[]) {
    const reply = await call({ kind: "export-geometry", bodyIds });
    if (reply.error) throw new Error(reply.error);
    if (!reply.exportDocument) throw new Error("Export geometry unavailable");
    return reply.exportDocument;
  }
  async exportStep(items: import("../model/step-export.js").StepItem[]) {
    const reply = await call({ kind: "export-step", items });
    if (reply.error) throw new Error(reply.error);
    if (!reply.step) throw new Error("STEP geometry unavailable");
    return reply.step;
  }
  async cancelStepExport(): Promise<void> {
    const reply = await call({ kind: "cancel-step-export" });
    if (reply.error) throw new Error(reply.error);
  }
  async draftDecorator(
    edit: Extract<import("../decorators/types.js").DecoratorEdit, { action: "settings" }>,
  ) {
    const reply = await call({ kind: "decorator-draft", edit });
    if (reply.error || !reply.decoratorDraft)
      throw new Error(reply.error ?? "Decorator draft unavailable");
    return reply.decoratorDraft;
  }
  async inspectDecorator(query: import("../decorators/inspection.js").DecoratorInspectionRequest) {
    const reply = await call({ kind: "decorator-inspect", query });
    if (reply.error || !reply.decoratorInspection)
      throw new Error(reply.error ?? "Decorator inspection unavailable");
    return reply.decoratorInspection;
  }
  async measure(targets: import("../model/measurement.js").MeasurementTarget[]) {
    const reply = await call({ kind: "measure", targets });
    if (reply.error) throw new Error(reply.error);
    if (!reply.measurement) throw new Error("Measurement unavailable");
    return reply.measurement;
  }
}
