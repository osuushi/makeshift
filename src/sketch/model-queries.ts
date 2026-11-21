import { defaultBench } from "../model/benches.js";
import type { ProfileEditView } from "../model/revolved-profile.js";
import type { BenchFocus } from "../model/smart-object.js";
import { type SketchDocument, withSketch } from "./document.js";
import type { ModelView } from "./model-api.js";
import { call } from "./model-transport.js";

/** Read-only view access and backend queries, outside the document edit slot. */
export class ModelQueries {
  private observingProfile = false;
  private profileData?: { view: ModelView; document: SketchDocument };
  private profileBodies?: {
    accepted: SketchDocument["bodies"];
    preview: NonNullable<ModelView["profileEdit"]>["preview"];
    bodies: SketchDocument["bodies"];
  };
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
  get acceptedData() {
    return this.view.data;
  }
  get profileEdit() {
    return this.view.profileEdit;
  }

  protected async observeProfilePreview(
    mayPublish: () => boolean,
    changed: () => void,
    reportError: (message: string) => void,
  ): Promise<void> {
    if (this.observingProfile || !this.profileEdit?.pending || !mayPublish()) return;
    this.observingProfile = true;
    try {
      while (mayPublish()) {
        const displayed: ProfileEditView | undefined = this.profileEdit;
        if (!displayed?.pending) return;
        try {
          const reply = await call({ kind: "read-profile-preview" }, this.view.data);
          if (this.profileEdit !== displayed || !mayPublish()) continue;
          const settled = reply.view.profileEdit;
          if (reply.error || !settled || settled.sketch.id !== displayed.sketch.id)
            throw new Error(reply.error ?? "Profile preview unavailable");
          const { pending, preview, removedDimples, error } = settled;
          this.view = {
            ...this.view,
            profileEdit: { ...displayed, pending, preview, removedDimples, error },
          };
          changed();
        } catch (error) {
          if (this.profileEdit !== displayed || !mayPublish()) continue;
          this.view = { ...this.view, profileEdit: { ...displayed, pending: false } };
          reportError(error instanceof Error ? error.message : String(error));
          changed();
          return;
        }
      }
    } finally {
      this.observingProfile = false;
    }
  }
  /** The sketch tools see the active plane while files still read acceptedData. */
  get data(): SketchDocument {
    const { data, profileEdit } = this.view;
    if (!profileEdit) {
      this.profileData = this.profileBodies = undefined;
      return data;
    }
    if (this.profileData?.view === this.view) return this.profileData.document;
    const preview = profileEdit.preview;
    if (this.profileBodies?.accepted !== data.bodies || this.profileBodies?.preview !== preview) {
      this.profileBodies = {
        accepted: data.bodies,
        preview,
        bodies: preview
          ? data.bodies?.map((body) => (body.id === preview.id ? preview : body))
          : data.bodies,
      };
    }
    const document = {
      ...data,
      sketches: [profileEdit.sketch],
      bodies: this.profileBodies?.bodies ?? data.bodies,
    };
    this.profileData = { view: this.view, document };
    return document;
  }
  get activeBench() {
    return this.view.activeBench ?? defaultBench.id;
  }
  get editingBench() {
    return this.view.editingBench ?? this.activeBench;
  }
  get benchFocus(): BenchFocus {
    return { active: this.activeBench, inline: this.view.inline ?? [] };
  }
  get linkedBenches() {
    return this.view.linkedBenches;
  }
  get benchTabs() {
    return this.view.benchTabs ?? [defaultBench];
  }
  async smartObjectSources() {
    const reply = await call({ kind: "smart-object-sources" });
    if (reply.error || !reply.smartObjectSources)
      throw new Error(reply.error ?? "Smart object sources unavailable");
    return reply.smartObjectSources;
  }
  async readDrawing() {
    const reply = await call({ kind: "read-drawing" });
    if (reply.error || !reply.drawing)
      throw new Error(reply.error ?? "Drawing benches unavailable");
    return reply.drawing;
  }
  get decoratorSources() {
    return this.view.decoratorSources ?? [];
  }
  get reopenOperation() {
    return this.view.reopenOperation;
  }
  get canUndoView(): boolean {
    return !this.profileEdit && !!this.view.canUndoView;
  }
  get canRedoView(): boolean {
    return !this.profileEdit && !!this.view.canRedoView;
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
    if (this.profileEdit)
      return this.profileEdit.draft ? withSketch(this.data, this.profileEdit.draft) : null;
    return this.view.candidate;
  }
  get statistics() {
    return { count: this.view.solveCount, milliseconds: this.view.solveMs };
  }

  async cancelEdgeFinishTargets(): Promise<void> {
    await call({ kind: "cancel-edge-finish-targets" });
  }
  async edgeFinishTargets(
    operation: Omit<import("../model/body.js").BodyEdgeFinish, "size">,
    points: import("./planes.js").Vector[],
  ) {
    const reply = await call({ kind: "edge-finish-targets", operation, points });
    if (reply.error || !reply.edgeFinishTargets)
      throw new Error(reply.error ?? "Snap targets unavailable");
    return reply.edgeFinishTargets;
  }
  async sections(frame: import("./planes.js").PlaneFrame, bodies: string[]) {
    const reply = await call({ kind: "sections", frame, bodies });
    if (reply.error) throw new Error(reply.error);
    if (!reply.sections) throw new Error("Cross sections unavailable");
    return reply.sections;
  }
  async exportGeometry(bodyIds?: string[], smartObjectIds?: string[], exact?: boolean) {
    const reply = await call({ kind: "export-geometry", bodyIds, smartObjectIds, exact });
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
