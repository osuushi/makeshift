import { exactBodies } from "../model/exact-body.js";
import type { AppliedProfile, ProfileSelection } from "../model/revolved-profile.js";
import type { Sketch, SketchDocument } from "../sketch/document.js";
import type { ModelRequest } from "../sketch/model-api.js";
import type { HistoryOperation } from "../sketch/operation-history.js";
import { continueBodyMetadata } from "./body-metadata.js";
import { editDocument } from "./document-edits.js";
import { type PreviewRequest, previewDocument } from "./document-preview.js";
import type { DocumentSession } from "./document-session.js";
import type { NativeSolver } from "./native-solver.js";
import { pasteGeometry } from "./paste-geometry.js";
import { profileAxisAnchors, profileSketch } from "./profile-chain.js";
import { ProfileDraft, type ReopenProfile } from "./profile-draft.js";
import { profileGeometry, profileGeometryKey, profileRegion } from "./profile-region.js";
import type { SolidCalculator } from "./solid-calculator.js";

/** Holds one temporary sketch and its body preview inside the document owner's edit slot. */
export class ProfileEdits {
  private current?: ProfileDraft;
  constructor(
    private kernel: SolidCalculator,
    private previewKernel: SolidCalculator,
    private solver: NativeSolver,
    private checkCancellation: () => void,
  ) {}

  get active() {
    return !!this.current;
  }
  get view() {
    return this.current?.view;
  }

  async settle(): Promise<void> {
    await this.current?.rebuild.settle();
  }

  private async begin(document: SketchDocument, source: ProfileSelection): Promise<void> {
    if (this.current) throw new Error("Apply or cancel Edit Profile first");
    const body = document.bodies?.find((body) => body.id === source.body);
    if (!body) throw new Error("Profile body no longer exists");
    const { profile } = await this.kernel.calculate({
      kind: "describe-revolved-profile",
      ...source,
      bodies: exactBodies([body]),
    });
    const { sketch, origins } = profileSketch(profile);
    const region = profileRegion(sketch, profile);
    if (!region) throw new Error("Could not recover a closed profile region");
    const initial = profileGeometryKey(profileGeometry(region, sketch, origins));
    this.checkCancellation();
    const { height, endGuides } = profile;
    this.current = new ProfileDraft(
      body,
      { source, height, endGuides, initial, origins },
      sketch,
      region,
      this.previewKernel,
    );
  }

  reopen(session: DocumentSession): void {
    const seed = session.reopenedPreview?.profile;
    if (!seed) return;
    const { sketch, key, removedDimples, ...input } = seed;
    const body = session.store.data.bodies?.find((body) => body.id === input.source.body);
    const document = session.candidate;
    const preview = document?.bodies?.find((body) => body.id === input.source.body);
    if (!body || !document || !preview)
      throw new Error("The applied profile body no longer exists");
    this.current = new ProfileDraft(
      body,
      input,
      sketch,
      profileRegion(sketch, input),
      this.previewKernel,
      {
        document,
        result: { key, preview, removedDimples },
      },
    );
    session.clearPreview();
  }

  discardSketchPreview(): void {
    if (this.current) this.current.draft = undefined;
  }

  cancel(): void {
    this.current?.rebuild.dispose();
    this.current = undefined;
  }

  handle(session: DocumentSession, request: ModelRequest): Promise<void> | undefined {
    const document = session.store.data;
    switch (request.kind) {
      case "begin-profile-edit":
        if (session.candidate || session.visualPreview)
          throw new Error("Finish the current edit first");
        return this.begin(document, request.selection);
      case "cancel-profile-edit":
        this.cancel();
        return Promise.resolve();
      case "read":
      case "new":
      case "open":
      case "sketch-grid":
        return undefined;
      default:
        return this.active ? this.sketchRequest(document, request) : undefined;
    }
  }

  async apply(
    session: DocumentSession,
    operation: HistoryOperation,
    accept: (profile: ReopenProfile) => Promise<void>,
  ): Promise<AppliedProfile | undefined> {
    const edit = this.requireEdit();
    if (edit.draft) throw new Error("Finish the sketch gesture first");
    await edit.rebuild.settle();
    if (this.current !== edit) throw new Error("The profile edit was closed");
    this.checkCancellation();
    const { preview, error, removedDimples } = edit.rebuild.view;
    if (error) throw new Error(error);
    const document = session.store.data;
    if (preview) {
      const snapshot = edit.snapshot();
      const reopened =
        edit.reopened?.result.preview === preview ? edit.reopened.document : undefined;
      let result = reopened;
      if (!result)
        result = continueBodyMetadata(document, {
          ...document,
          bodies: document.bodies?.map((body) => (body.id === preview.id ? preview : body)),
        });
      else if (result.sketchGrid !== document.sketchGrid)
        result = { ...result, sketchGrid: document.sketchGrid };
      session.begin({ ...operation, parameters: { selection: edit.input.source } });
      session.complete(result, undefined, reopened ? {} : null);
      await accept(snapshot);
    }
    this.cancel();
    return preview && document !== session.store.data
      ? { body: preview.id, removedDimples }
      : undefined;
  }

  private requireEdit(): ProfileDraft {
    if (!this.current) throw new Error("Open Edit Profile first");
    return this.current;
  }

  private async sketchRequest(document: SketchDocument, request: ModelRequest): Promise<void> {
    const edit = this.requireEdit();
    const workspace: SketchDocument = { units: "mm", sketches: [edit.sketch] };
    switch (request.kind) {
      case "discard":
        this.discardSketchPreview();
        return;
      case "accept":
        if (!edit.draft) throw new Error("No valid sketch edit to accept");
        edit.change(edit.draft);
        return;
      case "undo":
      case "redo":
        edit.history(request.kind);
        return;
      case "clear":
      case "remove":
        edit.change(editDocument(workspace, request).sketches[0]);
        return;
      case "preview":
      case "edit":
      case "offset-sketch":
      case "scale":
      case "mirror":
        await this.calculateSketch(workspace, edit, request);
        return;
      case "project":
        await this.calculateSketch(
          {
            ...workspace,
            bodies: document.bodies?.map((body) =>
              edit.rebuild.view.preview?.id === body.id ? edit.rebuild.view.preview : body,
            ),
          },
          edit,
          request,
        );
        return;
      case "paste-geometry":
        if (request.target?.id !== edit.sketch.id)
          throw new Error("Paste curves into the active profile");
        {
          const pasted = await pasteGeometry(workspace, request.text, this.kernel, request.target);
          this.checkCancellation();
          edit.change(this.sketchOnly(pasted, edit));
        }
        return;
      default:
        throw new Error("Apply or cancel Edit Profile first");
    }
  }

  private sketchOnly(
    document: SketchDocument,
    edit: ProfileDraft,
    bodies?: SketchDocument["bodies"],
  ): Sketch {
    const [sketch] = document.sketches;
    if (
      document.sketches.length !== 1 ||
      (document.bodies?.length && document.bodies !== bodies) ||
      sketch.id !== edit.sketch.id ||
      JSON.stringify(sketch.plane) !== JSON.stringify(edit.sketch.plane)
    )
      throw new Error("Edit curves in the active profile plane");
    return sketch;
  }

  private async calculateSketch(
    workspace: SketchDocument,
    edit: ProfileDraft,
    request: PreviewRequest,
  ): Promise<void> {
    edit.draft = undefined;
    const anchors =
      !edit.input.endGuides && (request.kind === "edit" || request.kind === "preview")
        ? profileAxisAnchors(request.sketch)
        : undefined;
    const result = await previewDocument(workspace, request, this.kernel, this.solver, anchors);
    const sketch = this.sketchOnly(result.document, edit, workspace.bodies);
    this.checkCancellation();
    if (request.kind === "edit") edit.change(sketch);
    else edit.draft = sketch;
  }
}
