import type { World } from "./world.js";

export const trackpadIdleMs = 200;

/** Pinch and native twist settle together, after their last input has gone quiet. */
export class TrackpadSnap {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private held = false;
  private pending = false;
  constructor(
    private world: World,
    signal: AbortSignal,
  ) {
    window.addEventListener("pointerdown", this.cancel, { capture: true, signal });
    window.addEventListener("blur", this.cancel, { signal });
    window.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") this.cancel();
      },
      { capture: true, signal },
    );
    signal.addEventListener("abort", this.cancel, { once: true });
  }
  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
  /** Stop queued completion without releasing or creating a navigation intent. */
  stop(): void {
    this.clearTimer();
    this.held = false;
    this.pending = false;
  }
  cancel = (): void => {
    this.world.rollAnimation.cancel();
    this.stop();
    this.world.navigation.release("trackpad");
  };
  hold(): void {
    this.clearTimer();
    this.held = true;
    this.world.navigation.hold("trackpad");
  }
  release(): void {
    if (!this.held) return;
    this.held = false;
    this.postpone();
  }
  request(): void {
    this.pending = true;
    this.postpone();
  }
  postpone(): void {
    if (!this.world.navigation.active) return;
    this.clearTimer();
    this.world.navigation.hold("trackpad");
    if (this.held) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const level = this.pending;
      this.pending = false;
      if (level && this.world.canNavigate() && !this.world.orbit.active) this.world.levelHorizon();
      this.world.navigation.release("trackpad");
    }, trackpadIdleMs);
  }
}
