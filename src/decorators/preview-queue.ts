import type { DisplayDocument } from "../model/display-document.js";
import type { EnabledDefinition } from "./javascript-hooks.js";
import {
  PreviewSignatureCache,
  previewFingerprint,
  previewSignatures,
} from "./preview-signatures.js";
import type { PackedPreviewMesh } from "./preview-wire.js";
import type { FaceReference } from "./types.js";

export interface PreviewRequest {
  document: DisplayDocument;
  sources: readonly EnabledDefinition[];
  live: boolean;
  signatures: Map<string, string>;
  fingerprint: string;
}

export interface PreviewResponse {
  meshes?: ({ id: string; body: string; faces: FaceReference[] } & PackedPreviewMesh)[];
  processedIds?: string[];
  elapsedMs?: number;
  error?: string;
}

/** A warm worker processes one snapshot at a time and keeps only the latest waiting one. */
export class PreviewQueue {
  private worker: Worker | null = null;
  private active: PreviewRequest | null = null;
  private pending: PreviewRequest | null = null;
  private sourcesKey = "";
  private completedFingerprint = "";
  private signatureCache = new PreviewSignatureCache();

  constructor(
    private onResult: (response: PreviewResponse, request: PreviewRequest) => void,
    private onError: () => void,
    private onBusy: (busy: boolean) => void = () => {},
  ) {}

  submit(
    document: DisplayDocument,
    sources: readonly EnabledDefinition[],
    live: boolean,
    preemptSettled = false,
    signatures = previewSignatures(document, JSON.stringify(sources), this.signatureCache),
  ): void {
    const nextSources = JSON.stringify(sources);
    const fingerprint = previewFingerprint(signatures, live);
    if (
      !this.pending &&
      (this.active?.fingerprint === fingerprint ||
        (!this.active && this.completedFingerprint === fingerprint))
    )
      return;
    if (this.pending?.fingerprint === fingerprint) return;
    const sourceChanged = this.sourcesKey !== nextSources;
    const enteringLive = live && this.active && !this.active.live;
    // A long settled hook must not hold up a newly started live gesture.
    // Disabling or replacing bundled code also stops its previous invocation.
    if (sourceChanged || (enteringLive && preemptSettled)) this.interrupt();
    this.sourcesKey = nextSources;
    this.pending = { document, sources, live, signatures, fingerprint };
    this.pump();
    this.onBusy(this.active !== null || this.pending !== null);
  }

  clear(): void {
    this.pending = null;
    this.completedFingerprint = "";
    this.interrupt();
    this.onBusy(false);
  }

  dispose(): void {
    this.clear();
  }

  private interrupt(): void {
    this.worker?.terminate();
    this.worker = null;
    this.active = null;
  }

  private pump(): void {
    if (this.active || !this.pending) return;
    if (!this.worker) {
      this.worker = new Worker(new URL("./preview-worker.ts", import.meta.url), { type: "module" });
      const current = this.worker;
      this.worker.onmessage = (event: MessageEvent<PreviewResponse>) => {
        if (this.worker !== current) return;
        const finished = this.active;
        this.active = null;
        // The retained worker has memoized these results. Deliver them so the
        // overlay can keep instances whose signatures still match the latest view.
        if (finished) {
          this.completedFingerprint = finished.fingerprint;
          this.onResult(event.data, finished);
        }
        this.pump();
        this.onBusy(this.active !== null || this.pending !== null);
      };
      this.worker.onerror = () => {
        if (this.worker !== current) return;
        this.worker?.terminate();
        this.worker = null;
        this.active = null;
        this.pending = null;
        this.onBusy(false);
        this.onError();
      };
    }
    this.active = this.pending;
    this.pending = null;
    this.worker.postMessage({
      document: this.active.document,
      sources: this.active.sources,
      live: this.active.live,
      signatures: [...this.active.signatures],
    });
  }
}
