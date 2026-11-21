import type { Body } from "../model/body.js";
import { topologyOrigins } from "../model/body-correspondence.js";
import { exactBodies } from "../model/exact-body.js";
import type { ProfileEditView, ProfileSelection } from "../model/revolved-profile.js";
import type { Sketch, SketchDocument } from "../sketch/document.js";
import type { ModelRequest } from "../sketch/model-api.js";
import type { HistoryOperation } from "../sketch/operation-history.js";
import { continueBodyMetadata } from "./body-metadata.js";
import { editDocument } from "./document-edits.js";
import { type PreviewRequest, previewDocument } from "./document-preview.js";
import type { DocumentSession } from "./document-session.js";
import { continuingBodies, materialize } from "./kernel-result.js";
import type { NativeSolver } from "./native-solver.js";
import { pasteGeometry } from "./paste-geometry.js";
import { boundary } from "./profile-boundary.js";
import { profileAxisAnchors, profileSketch, profileSpans } from "./profile-chain.js";
import type { SolidCalculator } from "./solid-calculator.js";

interface ProfileDraft {
  source: ProfileSelection;
  body: Body;
  height: number;
  endGuides: boolean;
  sketch: Sketch;
  initial: string;
  origins: Map<string, string>;
  past: Sketch[];
  future: Sketch[];
  draft?: Sketch;
  preview?: Body;
  error?: string;
}

function removedDimples(before: Body, preview: Body): number {
  const continued = new Set([...(topologyOrigins.get(preview)?.faces?.values() ?? [])].flat());
  return before.faces.filter((face) => face.sphere?.outward === -1 && !continued.has(face.id))
    .length;
}

/** Holds one temporary sketch and its body preview inside the document owner's edit slot. */
export class ProfileEdits {
  private current?: ProfileDraft;
  constructor(
    private kernel: SolidCalculator,
    private solver: NativeSolver,
    private checkCancellation: () => void,
  ) {}

  get active() {
    return !!this.current;
  }
  get view(): ProfileEditView | undefined {
    const edit = this.current;
    if (!edit) return undefined;
    const { preview } = edit;
    return {
      body: edit.source.body,
      height: edit.height,
      endGuides: edit.endGuides,
      sketch: edit.sketch,
      draft: edit.draft,
      preview,
      canUndo: !!edit.past.length,
      canRedo: !!edit.future.length,
      removedDimples: preview ? removedDimples(edit.body, preview) : 0,
      error: edit.error,
    };
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
    const initial = JSON.stringify(boundary(profileSpans(sketch.curves, profile), sketch.plane));
    this.checkCancellation();
    this.current = {
      source,
      body,
      height: profile.height,
      endGuides: profile.endGuides,
      sketch,
      initial,
      origins,
      past: [],
      future: [],
    };
  }

  discardSketchPreview(): void {
    if (this.current) this.current.draft = undefined;
  }

  cancel(): void {
    this.current = undefined;
  }

  handle(
    session: DocumentSession,
    request: ModelRequest,
    operation: HistoryOperation,
    accept: () => Promise<void>,
  ): Promise<void> | undefined {
    const document = session.store.data;
    switch (request.kind) {
      case "begin-profile-edit":
        if (session.candidate || session.visualPreview)
          throw new Error("Finish the current edit first");
        return this.begin(document, request.selection);
      case "apply-profile-edit":
        return this.apply(session, operation, accept);
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

  private async apply(
    session: DocumentSession,
    operation: HistoryOperation,
    accept: () => Promise<void>,
  ): Promise<void> {
    const document = session.store.data;
    const result = this.finish(document);
    if (result !== document) {
      session.begin(operation);
      session.complete(result);
      await accept();
    }
    this.cancel();
  }

  private finish(document: SketchDocument): SketchDocument {
    const current = this.requireEdit();
    if (current.draft) throw new Error("Finish the sketch gesture first");
    if (current.error) throw new Error(current.error);
    const { preview } = current;
    return preview
      ? continueBodyMetadata(document, {
          ...document,
          bodies: document.bodies?.map((body) => (body.id === preview.id ? preview : body)),
        })
      : document;
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
        await this.update(edit.draft);
        return;
      case "undo":
      case "redo":
        await this.history(request.kind, edit);
        return;
      case "clear":
      case "remove":
        await this.update(editDocument(workspace, request).sketches[0]);
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
              edit.preview?.id === body.id ? edit.preview : body,
            ),
          },
          edit,
          request,
        );
        return;
      case "paste-geometry":
        if (request.target?.id !== edit.sketch.id)
          throw new Error("Paste curves into the active profile");
        await this.update(
          this.sketchOnly(
            await pasteGeometry(workspace, request.text, this.kernel, request.target),
            edit,
          ),
        );
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
      !edit.endGuides && (request.kind === "edit" || request.kind === "preview")
        ? profileAxisAnchors(request.sketch)
        : undefined;
    const result = await previewDocument(workspace, request, this.kernel, this.solver, anchors);
    const sketch = this.sketchOnly(result.document, edit, workspace.bodies);
    this.checkCancellation();
    if (request.kind === "edit") await this.update(sketch);
    else edit.draft = sketch;
  }

  private async history(direction: "undo" | "redo", edit: ProfileDraft) {
    const from = direction === "undo" ? edit.past : edit.future;
    const to = direction === "undo" ? edit.future : edit.past;
    const target = from.at(-1);
    if (!target) return;
    const before = edit.sketch;
    await this.update(target, false);
    from.pop();
    to.push(before);
  }

  private async update(sketch: Sketch, checkpoint = true): Promise<void> {
    const edit = this.requireEdit();
    let preview: Body | undefined, error: string | undefined;
    try {
      const ordered = profileSpans(sketch.curves, edit);
      const geometry = boundary(ordered, sketch.plane);
      if (JSON.stringify(geometry) !== edit.initial) {
        const bodies = [edit.body];
        const reply = await this.kernel.calculate({
          kind: "replace-revolved-profile",
          ...edit.source,
          spans: geometry.map((span, index) => ({
            ...span,
            face: edit.origins.get(ordered[index].curve.id),
          })),
          bodies: exactBodies([edit.body]),
        });
        [preview] = continuingBodies(bodies, materialize(bodies, reply));
      }
    } catch (failure) {
      error = failure instanceof Error ? failure.message : String(failure);
    }
    this.checkCancellation();
    if (checkpoint && JSON.stringify(edit.sketch) !== JSON.stringify(sketch)) {
      edit.past.push(edit.sketch);
      edit.future.length = 0;
    }
    Object.assign(edit, { sketch, preview, error, draft: undefined });
  }
}
