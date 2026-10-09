import { controlMode } from "./control-preference.js";
import { onModelKeydown } from "./model-keys.js";
import { pointerDragThreshold } from "./pointer-intent.js";
import type { World } from "./world.js";

/** Capture navigation before drawing/selection, including release outside the canvas. */
export function installOrbitDrag(world: World, signal: AbortSignal): void {
  const drag = new OrbitDrag(world);
  const options = { signal, capture: true };
  window.addEventListener("pointerdown", drag.start, options);
  window.addEventListener("pointermove", drag.move, options);
  window.addEventListener("pointerup", drag.release, options);
  window.addEventListener("pointercancel", drag.release, options);
  world.canvas.addEventListener("lostpointercapture", drag.release, options);
  window.addEventListener("blur", drag.stop, { signal });
  onModelKeydown((event) => {
    if (event.key === "Escape" && drag.active) {
      consume(event);
      drag.stop();
    }
  }, options);
  for (const type of ["click", "dblclick"]) window.addEventListener(type, drag.click, options);
  signal.addEventListener("abort", drag.stop, { once: true });
}

class OrbitDrag {
  private drag: { id: number; bounds: DOMRect } | null = null;
  private suppressClick = false;
  private pending: PointerEvent | null = null;
  private replaying = false;
  constructor(private world: World) {}
  get active(): boolean {
    return !!this.pending || !!this.drag;
  }
  private onViewport(target: EventTarget | null): boolean {
    return (
      target instanceof Node &&
      (target === this.world.canvas || this.world.overlay.contains(target))
    );
  }
  start = (event: PointerEvent): void => {
    if (this.replaying) return;
    this.suppressClick = false;
    if (
      event.target instanceof Element &&
      event.target.closest(
        ".move-anchor, .body-axis-handle, .scale-anchor, .scale-handle, .extrude-axis-sphere, .extrude-twist-handle",
      )
    )
      return;
    if (event.metaKey && this.world.transformBoxContains?.(event.clientX, event.clientY)) return;
    const commandOrbit = event.button === 0 && event.metaKey;
    const mouseOrbit = controlMode() === "mouse" && event.button === 1 && event.shiftKey;
    if ((!commandOrbit && !mouseOrbit) || !this.onViewport(event.target)) return;
    consume(event);
    if (!this.world.canNavigate() || this.drag || this.pending) return;
    this.pending = event;
  };
  move = (event: PointerEvent): void => {
    const start = this.pending;
    if (start && event.pointerId === start.pointerId) {
      consume(event);
      if (
        Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY) <=
        pointerDragThreshold(start)
      )
        return;
      this.pending = null;
      this.suppressClick = true;
      this.world.cancelCameraMotion();
      this.drag = { id: start.pointerId, bounds: this.world.canvas.getBoundingClientRect() };
      this.world.beginOrbit(
        sphereCoordinates(start, this.drag.bounds),
        {
          x: start.clientX,
          y: start.clientY,
        },
        event.altKey,
        false,
      );
      this.world.canvas.setPointerCapture(start.pointerId);
    }
    if (!this.drag || event.pointerId !== this.drag.id) return;
    consume(event);
    this.world.orbit.drag(this.world, sphereCoordinates(event, this.drag.bounds), event.altKey);
    this.world.requestDraw();
  };
  stop = (): void => {
    if (this.pending) this.suppressClick = true;
    this.pending = null;
    const id = this.drag?.id;
    this.drag = null;
    this.world.orbit.end();
    if (id !== undefined) {
      if (this.world.canvas.hasPointerCapture(id)) this.world.canvas.releasePointerCapture(id);
      this.world.requestDraw();
    }
  };
  release = (event: PointerEvent): void => {
    const start = this.pending;
    if (start && event.pointerId === start.pointerId) {
      this.pending = null;
      if (event.type === "pointerup" && start.button === 0) {
        this.replaying = true;
        try {
          start.target?.dispatchEvent(
            new PointerEvent("pointerdown", {
              bubbles: true,
              cancelable: true,
              pointerId: start.pointerId,
              pointerType: start.pointerType,
              button: 0,
              buttons: 1,
              clientX: start.clientX,
              clientY: start.clientY,
              metaKey: start.metaKey,
              ctrlKey: start.ctrlKey,
              shiftKey: start.shiftKey,
            }),
          );
        } finally {
          this.replaying = false;
        }
      }
      return;
    }
    if (!this.drag || event.pointerId !== this.drag.id) return;
    consume(event);
    const frame = this.world.orbit.releaseFrame;
    this.stop();
    if (event.type === "pointerup") this.world.levelHorizon(frame);
  };
  click = (event: Event): void => {
    if (this.suppressClick && this.onViewport(event.target)) consume(event);
  };
}

function sphereCoordinates(event: PointerEvent, bounds: DOMRect) {
  const radius = Math.max(1, Math.min(bounds.width, bounds.height) / 2);
  return {
    x: (event.clientX - bounds.left - bounds.width / 2) / radius,
    y: -(event.clientY - bounds.top - bounds.height / 2) / radius,
  };
}
function consume(event: Event): void {
  event.preventDefault();
  event.stopImmediatePropagation();
}
