import type { DisplayDocument } from "../model/display-document.js";
import {
  decoratorPreviewMode,
  onDecoratorDisplayChange,
} from "../preferences/decorator-display.js";
import type { SketchEditor } from "../sketch/editor.js";
import { isBuiltinDecorator } from "./builtins.js";
import { PreviewOverlaySurfaces } from "./preview-overlay-surfaces.js";
import { PreviewQueue } from "./preview-queue.js";
import {
  PreviewSignatureCache,
  previewFingerprint,
  previewSignatures,
} from "./preview-signatures.js";
import { PreviewStatus } from "./preview-status.js";

class DecoratorOverlay {
  private readonly surfaces: PreviewOverlaySurfaces;
  private readonly status = new PreviewStatus();
  private readonly signatureCache = new PreviewSignatureCache();
  private readonly queue: PreviewQueue;
  private readonly disposePreference: () => void;
  private previous: DisplayDocument | null = null;
  private sourcesKey = "";
  private signatureKey = "";
  private currentSignatures = new Map<string, string>();
  private previousLive = false;
  private busy = false;
  private settleTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly editor: SketchEditor) {
    this.surfaces = new PreviewOverlaySurfaces(editor);
    this.queue = new PreviewQueue(
      (response, request) => {
        this.surfaces.replace(
          response.meshes ?? [],
          response.processedIds ?? [],
          request.signatures,
          this.currentSignatures,
        );
        if (response.error) {
          editor.notice = `Decorator preview: ${response.error}`;
          editor.refresh();
        }
      },
      () => {
        editor.notice = "Decorator preview unavailable";
        editor.refresh();
      },
      (busy) => {
        this.busy = busy;
        this.updateStatus();
      },
    );
    this.disposePreference = onDecoratorDisplayChange(() => {
      // Re-enter Detailed after clearing the worker even when document bytes are unchanged.
      this.previous = null;
      this.update();
      editor.world.requestDraw();
    });
    editor.world.changed.add(this.update);
  }

  private updateStatus(): void {
    const visible =
      this.editor.bodiesVisible &&
      (this.editor.display.decorators ?? []).some(
        (instance) =>
          !instance.problem &&
          instance.faces.some((face) => this.editor.visibility.visible(face.body)),
      );
    this.status.update(this.busy, visible);
  }

  private readonly update = () => {
    this.surfaces.updateVisibility();
    this.updateStatus();
    const document = this.editor.display;
    const nextSources = JSON.stringify(this.editor.store.decoratorSources);
    if (document === this.previous && nextSources === this.sourcesKey) return;
    const signatures = previewSignatures(document, nextSources, this.signatureCache);
    const nextSignatureKey = previewFingerprint(signatures, false);
    const live = this.editor.candidate !== null;
    const needsPreview =
      this.previous === null ||
      nextSignatureKey !== this.signatureKey ||
      (!live && this.previousLive);
    this.surfaces.sync(signatures, document);
    this.previous = document;
    this.sourcesKey = nextSources;
    this.signatureKey = nextSignatureKey;
    this.currentSignatures = signatures;
    this.previousLive = live;
    if (!needsPreview) return;
    clearTimeout(this.settleTimer);
    if (!signatures.size || decoratorPreviewMode() === "color-only") {
      this.queue.clear();
      if (!signatures.size) this.surfaces.clear();
      return;
    }
    const hasCustom =
      document.decorators?.some((instance) => !isBuiltinDecorator(instance.definition)) ?? false;
    this.queue.submit(document, this.editor.store.decoratorSources, live, hasCustom, signatures);
    if (live) this.scheduleSettled(document, nextSources, signatures, hasCustom);
  };

  private scheduleSettled(
    document: DisplayDocument,
    sources: string,
    signatures: Map<string, string>,
    custom: boolean,
  ): void {
    this.settleTimer = setTimeout(
      () => {
        if (this.editor.display === document && this.sourcesKey === sources)
          this.queue.submit(document, this.editor.store.decoratorSources, false, false, signatures);
      },
      custom ? 100 : 250,
    );
  }

  dispose(): void {
    clearTimeout(this.settleTimer);
    this.disposePreference();
    this.queue.dispose();
    this.surfaces.dispose();
    this.status.dispose();
    this.editor.world.changed.delete(this.update);
  }
}

export function decoratorOverlay(editor: SketchEditor): () => void {
  const overlay = new DecoratorOverlay(editor);
  return () => overlay.dispose();
}
