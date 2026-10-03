import { cubeAlignment } from "./orientation-cube-alignment.js";
import { createOrientationCube } from "./orientation-cube-view.js";
import { pointerDragThreshold } from "./pointer-intent.js";
import type { World } from "./world.js";

type CubeView = ReturnType<typeof createOrientationCube>;
type Face = CubeView["entries"][number]["face"];
const clickDelay = 250;
type PendingClick = {
  face: Face;
  event: PointerEvent;
  released: number;
  timer: ReturnType<typeof setTimeout>;
  unchanged: () => boolean;
};

export function installOrientationCube(world: World): () => void {
  const view = createOrientationCube(world);
  const input = new CubeInput(world, view);
  world.changed.add(view.draw);
  view.draw();
  return () => {
    input.dispose();
    world.changed.delete(view.draw);
    view.cube.remove();
  };
}

class CubeInput {
  private abort = new AbortController();
  private press: {
    event: PointerEvent;
    bounds: DOMRect;
    dragging: boolean;
    canonical: boolean;
  } | null = null;
  private pending: PendingClick | null = null;
  private suppressClick = false;

  constructor(
    private world: World,
    private view: CubeView,
  ) {
    const options = { signal: this.abort.signal };
    const cube = view.cube;
    cube.addEventListener("pointerdown", this.start, options);
    cube.addEventListener("pointermove", this.move, options);
    cube.addEventListener("pointerup", this.release, options);
    this.installCancellation(options);
    this.installActivation(options);
  }
  private installCancellation(options: { signal: AbortSignal }): void {
    const cube = this.view.cube;
    cube.addEventListener("pointercancel", this.cancel, options);
    cube.addEventListener(
      "lostpointercapture",
      (event) => {
        if (this.press?.event.pointerId === event.pointerId) this.cancel();
      },
      options,
    );
    window.addEventListener("blur", this.cancel, options);
    window.addEventListener("wheel", this.cancelPending, { ...options, capture: true });
    window.addEventListener("gesturestart", this.cancelPending, { ...options, capture: true });
    window.addEventListener(
      "pointerdown",
      (event) => {
        if (!(event.target instanceof Node) || !cube.contains(event.target)) this.cancelPending();
      },
      { ...options, capture: true },
    );
    window.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape" && (this.press || this.pending)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.cancel();
        }
      },
      { ...options, capture: true },
    );
  }
  private installActivation(options: { signal: AbortSignal }): void {
    // Own the focused cube key before canonical-plane capture shortcuts.
    window.addEventListener(
      "keydown",
      (event) => {
        if ((event.key !== "Enter" && event.key !== " ") || !(event.target instanceof Node)) return;
        const entry = this.view.entries.find(({ group }) => group.contains(event.target as Node));
        if (!entry) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.keyboardAlign(entry.face);
      },
      { ...options, capture: true },
    );
    for (const { face, group } of this.view.entries) {
      group.addEventListener(
        "click",
        (event) => {
          event.stopPropagation();
          if (!this.suppressClick) this.keyboardAlign(face);
        },
        options,
      );
    }
  }
  private keyboardAlign(face: Face): void {
    this.cancelPending();
    const direction = face.normal
      .clone()
      .applyQuaternion(this.world.camera.quaternion.clone().invert());
    this.align(face, direction.z > 1 - 1e-8);
  }
  private align(face: Face, canonical = false): void {
    const world = this.world;
    if (!world.canNavigate() || world.orbit.active) return;
    world.exit();
    const quaternion = cubeAlignment(face, world.camera.quaternion, canonical);
    world.animateOrientation(quaternion);
  }
  private start = (event: PointerEvent): void => {
    event.stopPropagation();
    this.suppressClick = true;
    if (event.button !== 0 || this.press || !this.world.canNavigate() || this.world.orbit.active) {
      this.cancelPending();
      return;
    }
    const face = this.faceAt(event);
    const pending = this.pending;
    const canonical = Boolean(
      pending &&
        pending.face === face &&
        pending.event.pointerType === event.pointerType &&
        performance.now() - pending.released <= clickDelay &&
        pending.unchanged() &&
        Math.hypot(event.clientX - pending.event.clientX, event.clientY - pending.event.clientY) <=
          (event.pointerType === "touch" ? 24 : 16),
    );
    this.cancelPending();
    this.world.cancelCameraMotion();
    this.press = {
      event,
      bounds: this.view.cube.getBoundingClientRect(),
      dragging: false,
      canonical,
    };
    this.view.cube.setPointerCapture(event.pointerId);
  };
  private move = (event: PointerEvent): void => {
    const press = this.press;
    if (!press || press.event.pointerId !== event.pointerId) return;
    const start = press.event;
    if (!press.dragging) {
      if (
        Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY) <=
        pointerDragThreshold(start)
      )
        return;
      press.dragging = true;
      this.world.beginOrbit(
        coordinates(start, press.bounds, this.world.canvas.getBoundingClientRect()),
        {
          x: start.clientX,
          y: start.clientY,
        },
        event.altKey,
      );
      this.view.cube.classList.add("dragging");
    }
    this.world.orbit.drag(
      this.world,
      coordinates(event, press.bounds, this.world.canvas.getBoundingClientRect()),
      event.altKey,
    );
    this.world.requestDraw();
  };
  private release = (event: PointerEvent): void => {
    const press = this.press;
    if (!press || press.event.pointerId !== event.pointerId) return;
    this.stop();
    if (press.dragging) {
      this.world.levelHorizon();
    } else {
      const face = this.faceAt(press.event);
      if (face) {
        if (press.canonical || face.kind !== "face") this.align(face, press.canonical);
        else this.queueClick(face, event);
      }
    }
  };
  private faceAt(event: PointerEvent): Face | undefined {
    return this.view.entries.find(({ group }) => group.contains(event.target as Node))?.face;
  }
  private queueClick(face: Face, event: PointerEvent): void {
    const world = this.world;
    const orientation = world.camera.quaternion.clone();
    const target = world.target.clone();
    const height = world.height;
    const workspace = world.workspace;
    const unchanged = () =>
      orientation.equals(world.camera.quaternion) &&
      target.equals(world.target) &&
      height === world.height &&
      workspace === world.workspace &&
      !world.cameraTransitioning;
    const timer = setTimeout(() => {
      this.cancelPending();
      if (unchanged()) this.align(face);
    }, clickDelay);
    this.pending = { face, event, released: performance.now(), timer, unchanged };
    this.view.cube.setAttribute("aria-busy", "true");
  }
  private cancelPending = (): void => {
    if (this.pending) clearTimeout(this.pending.timer);
    this.pending = null;
    this.view.cube.setAttribute("aria-busy", "false");
  };
  private cancel = (): void => {
    this.cancelPending();
    this.stop();
  };
  private stop = (): void => {
    const previous = this.press;
    this.press = null;
    this.view.cube.classList.remove("dragging");
    if (!previous) return;
    this.suppressClick = true;
    if (previous.dragging) this.world.orbit.end();
    if (this.view.cube.hasPointerCapture(previous.event.pointerId))
      this.view.cube.releasePointerCapture(previous.event.pointerId);
    this.world.requestDraw();
  };
  dispose(): void {
    this.cancel();
    this.abort.abort();
  }
}

function coordinates(event: PointerEvent, bounds: DOMRect, viewport: DOMRect) {
  const radius = Math.max(1, Math.min(viewport.width, viewport.height) / 2);
  return {
    viewport: {
      x: (event.clientX - viewport.left - viewport.width / 2) / radius,
      y: -(event.clientY - viewport.top - viewport.height / 2) / radius,
    },
    x: (event.clientX - bounds.left - bounds.width / 2) / (bounds.width / 2),
    y: -(event.clientY - bounds.top - bounds.height / 2) / (bounds.height / 2),
  };
}
