import type { DisplayDocument } from "../model/display-document.js";

import { InteractionHistory } from "./interaction-history.js";

type Kind =
  | "cube"
  | "mesh-import"
  | "tag-membership"
  | "entity-reorder"
  | "scale"
  | "transform-box-move"
  | "cross-section"
  | "construction-plane"
  | "plane-cut"
  | "mirror"
  | "cleanup"
  | "shell"
  | "erode"
  | "face-offset"
  | "face-move"
  | "edge-move"
  | "body-edge-finish"
  | "body-boolean"
  | "body-move"
  | "projection"
  | "use-edge"
  | "loft"
  | "revolve"
  | "extrude"
  | "placement"
  | "selection-choice"
  | "model-selection"
  | "pointer"
  | "pen"
  | "bezier"
  | "bow"
  | "fillet"
  | "offset"
  | "trim"
  | "numeric";
interface InteractionCapabilities {
  /** Picks currently belong to source/reference collection inside this tool. */
  selectsLocally?: () => boolean;
  /** Drain the controller's latest calculation before testing completion validity. */
  settled?: () => Promise<unknown>;
  /** Captured gestures always exclude navigation, including otherwise settled tools. */
  navigation: "blocked" | "when-released";
  /** Preserve owners whose ordinary document Undo first cancels their preview. */
  documentHistory?: "cancel-preview";
}
export class ActiveInteraction {
  private active: InteractionLease | null = null;
  constructor(
    private changed: () => void,
    readonly edited: () => void = () => {},
  ) {}
  get current(): InteractionLease | null {
    return this.active;
  }
  get dragging(): boolean {
    return !!this.active && (!this.active.navigationAllowed || this.active.captured);
  }
  get finishing(): boolean {
    return !!this.active && this.active.phase !== "editing";
  }
  get candidate(): DisplayDocument | null {
    return this.active?.candidate ?? null;
  }
  acquire(
    kind: Kind,
    cancel: () => Promise<void> | void,
    finish?: () => Promise<boolean>,
    capabilities: InteractionCapabilities = { navigation: "blocked" },
  ): InteractionLease | null {
    if (this.active) return null;
    this.active = new InteractionLease(this, kind, cancel, finish, capabilities);
    return this.active;
  }
  async cancel(): Promise<void> {
    const active = this.active;
    if (active && active.phase !== "closing") await active.cancel();
  }
  requestCancel(): boolean {
    if (!this.active || this.active.phase === "closing") return false;
    void this.cancel();
    return true;
  }
  release(lease: InteractionLease): void {
    if (this.active !== lease) return;
    this.active = null;
    this.changed();
  }
}
export class InteractionLease {
  settled: (() => Promise<unknown>) | undefined;
  readonly selectsLocally: () => boolean;
  history: Pick<
    InteractionHistory<unknown>,
    "canUndo" | "canRedo" | "checkpoint" | "navigate"
  > | null = null;
  readonly navigationAllowed: boolean;
  readonly cancelBeforeHistory: boolean;
  private phaseValue: "editing" | "waiting" | "closing" = "editing";
  private closing: Promise<void> | null = null;
  private resolveClosing: (() => void) | null = null;
  get phase(): "editing" | "waiting" | "closing" {
    return this.phaseValue;
  }
  set phase(value: "editing" | "waiting" | "closing") {
    this.phaseValue = value;
    if (value === "closing") {
      this.closing ??= new Promise((resolve) => {
        this.resolveClosing = resolve;
      });
    } else this.endClosing();
  }
  /** Join acceptance/cancellation that began while a caller awaited calculation. */
  async whenClosed(): Promise<void> {
    await this.closing;
  }
  private endClosing(): void {
    this.resolveClosing?.();
    this.resolveClosing = null;
    this.closing = null;
  }
  candidate: DisplayDocument | null = null;
  private captureTarget: { element: Element; id: number } | null = null;
  private abort = new AbortController();
  constructor(
    private owner: ActiveInteraction,
    readonly kind: Kind,
    readonly cancel: () => Promise<void> | void,
    readonly finish?: () => Promise<boolean>,
    capabilities: InteractionCapabilities = { navigation: "blocked" },
  ) {
    this.settled = capabilities.settled;
    this.selectsLocally = capabilities.selectsLocally ?? (() => false);
    this.navigationAllowed = capabilities.navigation === "when-released";
    this.cancelBeforeHistory = capabilities.documentHistory === "cancel-preview";
  }
  trackHistory<T>(
    root: HTMLElement,
    read: () => T,
    restore: (value: T) => void | Promise<void>,
  ): void {
    this.history = new InteractionHistory(read, restore, this.owner.edited);
    for (const type of ["focusout", "change", "click"] as const)
      root.addEventListener(
        type,
        (event) => {
          if (
            type === "click" &&
            !(
              event.target instanceof Element &&
              event.target.closest("button, select, input[type=checkbox]")
            )
          )
            return;
          const checkpoint = () => {
            if (this.owner.current === this && this.phase === "editing" && !this.captured)
              this.history?.checkpoint();
          };
          if (type === "focusout") checkpoint();
          else queueMicrotask(checkpoint);
        },
        { signal: this.abort.signal },
      );
  }
  get captured(): boolean {
    return this.captureTarget !== null;
  }
  wait(): boolean {
    if (this.owner.current !== this || this.phase !== "editing") return false;
    this.phase = "waiting";
    return true;
  }
  resume(): void {
    if (this.owner.current === this && this.phase === "waiting") this.phase = "editing";
  }
  close(): boolean {
    if (this.owner.current !== this || this.phase === "closing") return false;
    this.phase = "closing";
    return true;
  }
  show(candidate: DisplayDocument | null): void {
    if (this.owner.current === this && (candidate === null || this.phase !== "closing"))
      this.candidate = candidate;
  }
  capture(element: Element, id: number): void {
    this.history?.checkpoint();
    this.captureTarget = { element, id };
    element.addEventListener(
      "lostpointercapture",
      (event) => {
        if (this.captureTarget?.id === (event as PointerEvent).pointerId)
          this.owner.requestCancel();
      },
      { signal: this.abort.signal },
    );
    try {
      element.setPointerCapture(id);
    } catch (error) {
      // A queued widget handoff can replay its complete gesture after physical release.
      if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error;
    }
  }
  releaseCapture(): void {
    const capture = this.captureTarget;
    this.captureTarget = null;
    if (capture && this.phase === "editing") this.history?.checkpoint();
    if (capture?.element.hasPointerCapture(capture.id))
      capture.element.releasePointerCapture(capture.id);
  }
  release(): void {
    this.abort.abort();
    this.releaseCapture();
    this.owner.release(this);
    this.endClosing();
  }
}
