import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { movementRequest, type TopologyMovement } from "./topology-movement.js";

/** Serial preview calculations and their persistent, tool-local refusal. */
export class TopologyMovePreview {
  readonly feedback = document.createElement("div");
  latest: TopologyMovement | null = null;
  verified: TopologyMovement | null = null;
  valid = false;
  invalid = false;
  running: Promise<void> | null = null;
  private pending: TopologyMovement | null = null;
  constructor(
    private editor: SketchEditor,
    private kind: "faces" | "edges",
    private lease: () => InteractionLease | null,
  ) {
    this.feedback.className = "topology-move-feedback";
    this.feedback.setAttribute("role", "alert");
    this.feedback.hidden = true;
  }
  queue(movement: TopologyMovement | null, invalid = false): void {
    this.valid = false;
    this.invalid = invalid;
    this.latest = this.pending = movement;
    this.feedback.hidden = !invalid;
    this.feedback.textContent = invalid ? "Enter finite movement values." : "";
    this.editor.notice = invalid
      ? "Enter finite movement values"
      : `Move ${this.kind} · Calculating… · Escape to cancel`;
    if (this.running) this.editor.store.supersedePreview();
    else if (movement) this.running = this.drain();
  }
  private async drain(): Promise<void> {
    while (this.pending && this.lease()?.phase === "editing") {
      const request = this.pending;
      this.pending = null;
      const operation = movementRequest(request);
      const success = await this.editor.store.request(
        request.bodyIds?.length ? operation : { ...operation, presentation: "deferred" },
        (preview) => {
          this.lease()?.showVisual(preview);
          this.editor.refresh();
        },
      );
      const lease = this.lease();
      if (lease?.phase !== "editing" || request !== this.latest) continue;
      this.valid = success;
      this.invalid = !success;
      if (success) {
        this.verified = request;
        lease.show(this.editor.store.candidate);
        this.editor.notice = `Move ${this.kind} · Enter to accept · Escape to cancel`;
      } else {
        const reason = /Invalid BRep|reconnect|reconstructed face|fit a surface/i.test(
          this.editor.message,
        )
          ? "The adjoining faces could not be reconnected at this position."
          : this.editor.message || "The adjoining faces could not be reconnected.";
        this.feedback.title = this.editor.message;
        this.feedback.textContent = `Cannot move ${this.kind}. ${reason} Try a smaller distance or another direction, or Escape to cancel.`;
        this.editor.notice = this.feedback.textContent;
      }
      // A previous valid image can remain visible, but cannot be accepted for
      // this rejected input. Ordinary reads/dismissal must not erase its refusal.
      this.feedback.hidden = success;
      this.editor.refresh();
    }
    this.running = null;
    this.editor.refresh();
  }
  reset(): void {
    this.pending = this.latest = this.verified = null;
    this.valid = this.invalid = false;
    this.feedback.hidden = true;
    this.feedback.textContent = "";
  }
}
