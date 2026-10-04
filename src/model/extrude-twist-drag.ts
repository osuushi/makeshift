import * as THREE from "three";
import { onModelKeydown } from "../sketch/model-keys.js";
import { replayPointerModifiers } from "../sketch/modifier-pointer.js";
import { arrowWidthAxis } from "../sketch/move-widget/geometry.js";
import type { Vector } from "../sketch/planes.js";
import { anchorSnap } from "./anchor-snapping.js";
import type { ExtrudeTwist, TwistFrame } from "./extrude-twist.js";

class TwistDrag {
  private drag: {
    id: number;
    kind: "origin" | "angle";
    origin: Vector;
    value: number;
    frame: TwistFrame;
    plane: THREE.Plane;
    hit: THREE.Vector3;
    lastAngle: number;
    total: number;
    moved: boolean;
    x: number;
    y: number;
  } | null = null;
  constructor(
    private tool: ExtrudeTwist,
    signal: AbortSignal,
  ) {
    for (const [kind, button] of [
      ["origin", tool.sphere],
      ["angle", tool.handle],
    ] as const)
      button.addEventListener("pointerdown", (event) => this.start(event, kind, button), {
        signal,
      });
    window.addEventListener("pointermove", (event) => this.move(event), { signal });
    replayPointerModifiers(
      signal,
      () => !!this.drag,
      (event) => this.move(event),
    );
    window.addEventListener(
      "pointerup",
      (event) => {
        if (event.pointerId === this.drag?.id) this.finish(false);
      },
      { signal },
    );
    onModelKeydown(
      (event) => {
        if (event.key !== "Escape" || !this.drag) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.finish(true);
      },
      { signal, capture: true },
    );
    signal.addEventListener(
      "abort",
      () => {
        this.drag = null;
      },
      { once: true },
    );
  }
  private point(event: PointerEvent, plane: THREE.Plane): THREE.Vector3 | null {
    const world = this.tool.editor.world;
    const bounds = world.canvas.getBoundingClientRect(),
      ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2(
        (2 * (event.clientX - bounds.x)) / bounds.width - 1,
        1 - (2 * (event.clientY - bounds.y)) / bounds.height,
      ),
      world.camera,
    );
    return ray.ray.intersectPlane(plane, new THREE.Vector3());
  }
  private angle(hit: THREE.Vector3, origin: Vector, frame: TwistFrame): number {
    const u = new THREE.Vector3(...arrowWidthAxis(frame.normal));
    const v = new THREE.Vector3(...frame.normal).cross(u);
    const radial = hit.clone().sub(new THREE.Vector3(...origin));
    return (Math.atan2(radial.dot(v), radial.dot(u)) * 180) / Math.PI;
  }
  private start(event: PointerEvent, kind: "origin" | "angle", button: HTMLButtonElement): void {
    const tool = this.tool,
      frame = tool.frame;
    if (event.button || button.disabled || !frame?.coplanar || !tool.origin || !tool.begin())
      return;
    event.preventDefault();
    event.stopPropagation();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      new THREE.Vector3(...frame.normal),
      new THREE.Vector3(...frame.center),
    );
    const hit = this.point(event, plane);
    if (!hit) return;
    if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur();
    this.drag = {
      id: event.pointerId,
      kind,
      origin: [...tool.origin],
      value: tool.angle,
      frame,
      plane,
      hit,
      lastAngle: this.angle(hit, tool.origin, frame),
      total: tool.angle,
      moved: false,
      x: event.clientX,
      y: event.clientY,
    };
    tool.lease()?.capture(button, event.pointerId);
  }
  private move(event: PointerEvent): void {
    const tool = this.tool,
      drag = this.drag;
    if (!drag || event.pointerId !== drag.id || tool.lease()?.phase !== "editing") return;
    drag.moved ||= Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 3;
    if (!drag.moved) return;
    const hit = this.point(event, drag.plane);
    if (!hit) return;
    if (drag.kind === "origin") {
      const snap = event.metaKey
        ? null
        : anchorSnap(tool.editor, { x: event.clientX, y: event.clientY }, drag.frame);
      tool.sphere.dataset.snapped = String(!!snap);
      tool.origin =
        snap ?? (new THREE.Vector3(...drag.origin).add(hit.sub(drag.hit)).toArray() as Vector);
    } else {
      const next = this.angle(hit, drag.origin, drag.frame);
      drag.total += ((next - drag.lastAngle + 540) % 360) - 180;
      drag.lastAngle = next;
      tool.angle = event.shiftKey ? drag.total : Math.round(drag.total);
    }
    tool.changed();
  }
  private finish(cancel: boolean): void {
    const tool = this.tool,
      previous = this.drag;
    if (!previous) return;
    this.drag = null;
    delete tool.sphere.dataset.snapped;
    if (cancel) {
      tool.origin = previous.origin;
      tool.angle = previous.value;
      tool.changed();
    }
    // Restore a cancelled gesture before release records its completed parameter checkpoint.
    tool.lease()?.releaseCapture();
    if (!cancel && !previous.moved && previous.kind === "angle") {
      tool.input.focus();
      tool.input.select();
    }
    tool.editor.refresh();
  }
  cancel(): boolean {
    if (!this.drag) return false;
    this.finish(true);
    return true;
  }
}
export function installTwistDrag(tool: ExtrudeTwist, signal: AbortSignal): () => boolean {
  const drag = new TwistDrag(tool, signal);
  return () => drag.cancel();
}
