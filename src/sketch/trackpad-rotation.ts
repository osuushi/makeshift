import type {} from "./navigation-host.js";
import { QuarterTurn } from "./quarter-turn.js";
import { type TrackpadSnap, trackpadIdleMs } from "./trackpad-snap.js";
import type { World } from "./world.js";

/** Native trackpad rotation shares the pointer anchor used by pinch zoom. */
export function installTrackpadRotation(
  world: World,
  signal: AbortSignal,
  snap: TrackpadSnap,
): void {
  const host = window.makeshiftNavigation;
  if (!host) return;
  const turn = new QuarterTurn();
  let lastRotation = -Infinity;
  let enabled = true;
  const enable = () => {
    enabled = true;
  };
  window.addEventListener("pointermove", enable, { signal, capture: true });
  window.addEventListener("focus", enable, { signal });
  const clear = () => {
    enabled = false;
    turn.reset();
    lastRotation = -Infinity;
    snap.cancel();
  };
  window.addEventListener("blur", clear, { signal });
  document.documentElement.addEventListener("pointerleave", clear, { signal });
  const remove = host.onRotate((degrees, pointer) => {
    if (degrees === 0) {
      if (Number.isFinite(lastRotation)) snap.postpone();
      turn.reset();
      lastRotation = -Infinity;
      return;
    }
    if (
      !enabled ||
      !Number.isFinite(pointer?.x) ||
      !Number.isFinite(pointer?.y) ||
      !Number.isFinite(degrees) ||
      !degrees ||
      !world.canNavigate() ||
      world.orbit.active
    )
      return;
    const hit = document.elementFromPoint(pointer.x, pointer.y);
    if (
      !hit ||
      (hit !== world.canvas && !world.overlay.contains(hit)) ||
      hit.closest("button, input, select, textarea, [contenteditable]")
    )
      return;
    world.navigation.begin();
    snap.postpone();
    const bounds = world.canvas.getBoundingClientRect();
    const now = performance.now();
    if (now - lastRotation >= trackpadIdleMs) turn.reset();
    lastRotation = now;
    const radians = turn.update((degrees * Math.PI) / 180);
    if (radians)
      world.rollAnimation.start(
        radians,
        {
          x: pointer.x - bounds.left - bounds.width / 2,
          y: pointer.y - bounds.top - bounds.height / 2,
        },
        bounds.height,
      );
    world.requestDraw();
  });
  signal.addEventListener("abort", remove, { once: true });
}
