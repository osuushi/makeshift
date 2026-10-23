export interface MarkerFade {
  desired: boolean;
  born: number;
  opacity: number;
  updated: number;
}
const duration = 100;

/** Integrate through the minimum lifetime boundary even when a frame is delayed. */
export function advanceMarkerFade(state: MarkerFade, now: number, saved: boolean): boolean {
  const end = Math.max(state.updated, now);
  if (saved) state.opacity = state.desired ? 1 : 0;
  else if (state.desired)
    state.opacity = Math.min(1, state.opacity + (end - state.updated) / duration);
  else {
    const dwellEnd = state.born + duration;
    const rising = Math.max(0, Math.min(end, dwellEnd) - state.updated);
    state.opacity = Math.min(1, state.opacity + rising / duration);
    const falling = Math.max(0, end - Math.max(state.updated, dwellEnd));
    state.opacity = Math.max(0, state.opacity - falling / duration);
  }
  state.updated = end;
  return (
    !saved && (state.desired ? state.opacity < 1 : end < state.born + duration || state.opacity > 0)
  );
}

/** Account for elapsed time under the old target before reversing direction. */
export function desireMarker(
  state: MarkerFade,
  desired: boolean,
  now: number,
  saved: boolean,
): void {
  if (state.desired === desired) return;
  advanceMarkerFade(state, now, saved);
  state.desired = desired;
}
