/** CSS-pixel travel before contact becomes a drag; Pencil taps include tip drift. */
export const pointerDragThreshold = (event: Pick<PointerEvent, "pointerType">): number =>
  event.pointerType === "pen" ? 16 : 3;

/** Pick at initial contact, where the user aimed, rather than the lifted tip. */
export function penSelectionClick(start: PointerEvent): PointerEvent {
  return new PointerEvent("click", {
    bubbles: true,
    cancelable: true,
    pointerType: "pen",
    pointerId: start.pointerId,
    button: 0,
    detail: 1,
    clientX: start.clientX,
    clientY: start.clientY,
    shiftKey: start.shiftKey,
    metaKey: start.metaKey,
    ctrlKey: start.ctrlKey,
    altKey: start.altKey,
  });
}
/** Geometry handoffs have already passed navigation arbitration. */
export const replayedGeometryPointers = new WeakSet<Event>();
/** Command clicks are delivered after physical release resolves click versus orbit. */
export const releasedPointerPresses = new WeakSet<Event>();
