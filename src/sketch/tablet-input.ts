import type {} from "../ipad/protocol.js";
import { panCamera, zoomCamera } from "./camera-motion.js";
import type { Point } from "./planes.js";
import { QuarterTurn } from "./quarter-turn.js";
import type { World } from "./world.js";

/** Touch navigates before geometry listeners. Pen/mouse retain ordinary tool routes. */
export function installTabletInput(world: World, signal: AbortSignal): void {
  if (window.makeshiftRemote) new TabletInput(world, signal);
}
class TabletInput {
  private touches = new Map<number, Point>();
  private previous: ReturnType<typeof pair> | null = null;
  private origin: Point | null = null;
  private pen: number | null = null;
  private rotating = false;
  private readonly twist = new QuarterTurn();
  private pairFrame: number | null = null;
  private suppressClickUntil = 0;
  constructor(
    private world: World,
    signal: AbortSignal,
  ) {
    const options = { capture: true, passive: false, signal };
    window.addEventListener("pointerdown", this.start, options);
    window.addEventListener("pointermove", this.move, options);
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const)
      window.addEventListener(type, this.release, options);
    for (const type of ["click", "dblclick"])
      window.addEventListener(
        type,
        (event) => {
          if (
            this.viewport(event.target) &&
            performance.now() < this.suppressClickUntil &&
            (!(event instanceof PointerEvent) ||
              event.pointerType === "touch" ||
              !event.pointerType)
          )
            consume(event);
        },
        options,
      );
    // Safari also emits gesture events for these touches; avoid a second zoom path.
    for (const type of ["gesturestart", "gesturechange", "gestureend"])
      window.addEventListener(
        type,
        (event) => {
          if (this.viewport(event.target)) consume(event);
        },
        options,
      );
    window.addEventListener("blur", this.reset, { signal });
    signal.addEventListener("abort", this.reset, { once: true });
  }
  private viewport(target: EventTarget | null): boolean {
    return (
      target instanceof Node &&
      !(target instanceof Element && target.closest(".selection-overlap")) &&
      (target === this.world.canvas || this.world.overlay.contains(target))
    );
  }
  private sphere(p: Point): Point {
    const bounds = this.world.canvas.getBoundingClientRect();
    const radius = Math.max(1, Math.min(bounds.width, bounds.height) / 2);
    return {
      x: (p.x - bounds.left - bounds.width / 2) / radius,
      y: -(p.y - bounds.top - bounds.height / 2) / radius,
    };
  }
  private endOrbit(): void {
    if (this.rotating) this.world.orbit.end();
    this.rotating = false;
    this.twist.reset();
    if (this.pairFrame !== null) cancelAnimationFrame(this.pairFrame);
    this.pairFrame = null;
  }
  private rebase(): void {
    this.endOrbit();
    this.previous = null;
    this.origin = null;
    if (!this.world.canNavigate() || this.pen !== null) return;
    const points = [...this.touches.values()];
    if (points.length === 1) this.origin = points[0];
    else if (points.length === 2) this.previous = pair(points);
  }
  private start = (event: PointerEvent): void => {
    if (!this.viewport(event.target)) return;
    if (event.pointerType === "pen") {
      this.pen = event.pointerId;
      this.endOrbit();
      this.previous = null;
      this.origin = null;
      return;
    }
    if (event.pointerType !== "touch") return;
    if (event.target instanceof Element) {
      if (event.target.closest("input, select, textarea")) return;
      const button = event.target.closest("button");
      if (
        button &&
        !button.matches(
          ".orientable-handle, .body-axis-handle, .move-anchor, .scale-anchor, .scale-handle, .axial-arrow, .extrude-axis-sphere, .pivot-control, .move-control",
        )
      )
        return;
    }
    this.world.longPress?.(event);
    consume(event);
    this.suppressClickUntil = performance.now() + 1000;
    this.flushPair();
    if (!this.touches.size && this.pen === null && this.world.canNavigate())
      this.world.navigation.hold("touch");
    this.touches.set(event.pointerId, point(event));
    this.world.canvas.setPointerCapture(event.pointerId);
    if (this.pen === null && this.world.canNavigate()) this.world.cancelCameraMotion();
    this.rebase();
  };
  private move = (event: PointerEvent): void => {
    if (!this.touches.has(event.pointerId)) return;
    this.world.longPress?.(event);
    consume(event);
    this.touches.set(event.pointerId, point(event));
    if (this.pen !== null || !this.world.canNavigate()) {
      this.endOrbit();
      this.previous = null;
      return;
    }
    const points = [...this.touches.values()];
    if (points.length === 1 && this.origin) {
      if (
        !this.rotating &&
        Math.hypot(points[0].x - this.origin.x, points[0].y - this.origin.y) >= 6
      ) {
        this.world.beginOrbit(this.sphere(this.origin), this.origin);
        this.rotating = true;
      }
      if (this.rotating) this.world.orbit.drag(this.world, this.sphere(points[0]));
    } else if (points.length === 2 && this.pairFrame === null)
      this.pairFrame = requestAnimationFrame(this.flushPair);
    this.world.requestDraw();
  };
  // Both contacts arrive as separate pointer events. Sample together per frame so
  // a translation cannot look like a threshold-crossing twist between the events.
  private flushPair = (): void => {
    if (this.pairFrame === null) return;
    cancelAnimationFrame(this.pairFrame);
    this.pairFrame = null;
    const points = [...this.touches.values()];
    if (points.length !== 2 || this.pen !== null || !this.world.canNavigate()) return;
    this.panZoom(points);
    this.world.requestDraw();
  };
  private panZoom(points: Point[]): void {
    const next = pair(points),
      bounds = this.world.canvas.getBoundingClientRect();
    if (this.previous) {
      panCamera(
        this.world,
        next.center.x - this.previous.center.x,
        next.center.y - this.previous.center.y,
        bounds.height,
      );
      if (this.previous.distance > 1 && next.distance > 1) {
        const offset = {
          x: next.center.x - bounds.left - bounds.width / 2,
          y: next.center.y - bounds.top - bounds.height / 2,
        };
        zoomCamera(this.world, this.previous.distance / next.distance, offset, bounds.height);
        const angle = next.angle - this.previous.angle;
        const turn = this.twist.update(Math.atan2(Math.sin(angle), Math.cos(angle)));
        this.world.rollAnimation.updateAnchor(offset);
        if (turn) this.world.rollAnimation.start(turn, offset, bounds.height);
      }
    }
    this.previous = next;
  }
  private release = (event: PointerEvent): void => {
    if (event.pointerId === this.pen) {
      this.pen = null;
      return;
    }
    if (!this.touches.has(event.pointerId)) return;
    this.flushPair();
    if (event.type !== "pointerup") this.world.rollAnimation.cancel();
    this.touches.delete(event.pointerId);
    this.world.longPress?.(event);
    consume(event);
    this.suppressClickUntil = performance.now() + 1000;
    const level = event.type === "pointerup" && this.rotating && !this.touches.size;
    if (this.world.canvas.hasPointerCapture(event.pointerId))
      this.world.canvas.releasePointerCapture(event.pointerId);
    this.rebase();
    if (level) this.world.levelHorizon();
    if (!this.touches.size) this.world.navigation.release("touch");
  };
  private reset = (): void => {
    const ids = [...this.touches.keys()];
    this.touches.clear();
    this.world.navigation.release("touch");
    this.pen = null;
    this.endOrbit();
    this.previous = null;
    this.origin = null;
    for (const id of ids)
      if (this.world.canvas.hasPointerCapture(id)) this.world.canvas.releasePointerCapture(id);
  };
}
function consume(event: Event): void {
  event.preventDefault();
  event.stopImmediatePropagation();
}
function point(event: PointerEvent): Point {
  return { x: event.clientX, y: event.clientY };
}
function pair(points: Point[]) {
  return {
    center: { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 },
    distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
    angle: Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x),
  };
}
