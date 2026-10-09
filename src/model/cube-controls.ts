import type { InteractionLease } from "../sketch/active-interaction.js";
import { emptySketch } from "../sketch/document.js";
import type { SketchEditor } from "../sketch/editor.js";
import { rectangle } from "../sketch/geometry.js";
import type { PlaneFrame, Point } from "../sketch/planes.js";
import { pointerDragThreshold } from "../sketch/pointer-intent.js";
import { profilesFor } from "../sketch/profiles.js";
import { toolCatalog } from "../tools/catalog.js";
import { CubePreview } from "./cube-preview.js";
import { cubeDefaultSize, cubeHoverPlane, cubePlane, cubeRectangle } from "./cube-rectangle.js";

const hint =
  "Cube · Click to place a cube · Drag from a corner · Option centers and extrudes symmetrically · Shift locks a square";

/** Cube owns only placement, then yields to ordinary sketch and extrusion primitives. */
export class CubeControls {
  private abort = new AbortController();
  private unregister: () => void;
  private preview: CubePreview;
  private lease: InteractionLease | null = null;
  private pointer: Point | null = null;
  private gesture: {
    id: number;
    screen: Point;
    anchor: Point;
    plane: PlaneFrame;
    size: number;
    threshold: number;
    moved: boolean;
  } | null = null;
  private square = false;
  private symmetric = false;
  private consumeClick = false;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
    private extrude: (depth: number, symmetric: boolean) => boolean,
  ) {
    this.preview = new CubePreview(editor.world, overlay);
    this.unregister = toolCatalog(editor).register({
      id: "cube",
      label: "Cube",
      category: "Solid",
      aliases: ["box", "rectangular prism", "3d primitive"],
      description: "Place a rectangle sketch, then adjust its extrusion",
      reason: () => null,
      run: () => this.begin(),
    });
    const options = { signal: this.abort.signal, capture: true };
    const canvas = editor.world.canvas;
    canvas.addEventListener("pointerdown", this.press, options);
    canvas.addEventListener("pointermove", this.move, options);
    canvas.addEventListener("pointerup", this.release, options);
    canvas.addEventListener(
      "pointercancel",
      () => {
        if (this.lease?.phase === "editing") this.cancel();
      },
      options,
    );
    canvas.addEventListener(
      "pointerleave",
      () => {
        if (!this.gesture) {
          this.pointer = null;
          this.preview.hide();
          editor.world.present();
        }
      },
      options,
    );
    canvas.addEventListener(
      "click",
      (event) => {
        if (this.consumeClick || this.lease) {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.consumeClick = false;
        }
      },
      options,
    );
    for (const type of ["keydown", "keyup"] as const)
      window.addEventListener(
        type,
        (event) => {
          if (!this.lease || !["Shift", "Alt"].includes(event.key)) return;
          this.square = event.shiftKey;
          this.symmetric = event.altKey;
          this.editor.refresh();
        },
        options,
      );
    window.addEventListener(
      "blur",
      () => {
        if (this.gesture && this.lease?.phase === "editing") this.cancel();
      },
      options,
    );
    editor.world.changed.add(this.update);
  }
  private begin(): boolean {
    const editor = this.editor;
    if (editor.world.active) editor.world.exit();
    this.lease = editor.interactions.acquire(
      "cube",
      () => this.cancel(),
      async () => {
        this.cancel();
        return true;
      },
      { navigation: "when-released", selectsLocally: () => true },
    );
    if (!this.lease) return false;
    editor.modeling.targets = [];
    editor.tool = "select";
    editor.creationArmed = false;
    editor.message = "";
    editor.notice = hint;
    this.pointer = null;
    this.symmetric = false;
    this.consumeClick = false;
    editor.refresh();
    return true;
  }
  private snap(point: Point): Point {
    const spacing = this.editor.gridSnap ? this.editor.world.spacing : 0;
    return spacing
      ? {
          x: Math.round(point.x / spacing) * spacing,
          y: Math.round(point.y / spacing) * spacing,
        }
      : point;
  }
  private bounds() {
    const world = this.editor.world;
    const plane =
      this.gesture?.plane ??
      (this.pointer ? cubeHoverPlane(this.editor, this.pointer) : cubePlane(world));
    const point = this.pointer && world.pointAt(plane, this.pointer.x, this.pointer.y);
    if (!point) return null;
    const anchor = this.gesture?.anchor ?? this.snap(point);
    return {
      plane,
      ...cubeRectangle(
        anchor,
        this.gesture?.moved ? this.snap(point) : null,
        this.gesture?.size ?? cubeDefaultSize(world, plane),
        this.square,
        this.symmetric,
      ),
    };
  }
  private update = (): void => {
    if (!this.lease) return;
    const bounds = this.bounds();
    if (bounds) this.preview.show(bounds.plane, bounds);
    else this.preview.hide();
  };
  private press = (event: PointerEvent): void => {
    if (
      this.lease?.phase !== "editing" ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      this.editor.world.navigation.dragging
    )
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const world = this.editor.world;
    const plane = cubeHoverPlane(this.editor, { x: event.clientX, y: event.clientY });
    const point = world.pointAt(plane, event.clientX, event.clientY);
    if (!point) return;
    this.editor.message = "";
    world.canvas.focus();
    this.pointer = { x: event.clientX, y: event.clientY };
    this.square = event.shiftKey;
    this.symmetric = event.altKey;
    this.gesture = {
      id: event.pointerId,
      screen: this.pointer,
      anchor: this.snap(point),
      plane,
      size: cubeDefaultSize(world, plane),
      threshold: pointerDragThreshold(event),
      moved: false,
    };
    this.lease.capture(world.canvas, event.pointerId);
    this.editor.refresh();
  };
  private move = (event: PointerEvent): void => {
    if (this.lease?.phase !== "editing") return;
    if (this.gesture && this.gesture.id !== event.pointerId) return;
    this.pointer = { x: event.clientX, y: event.clientY };
    this.square = event.shiftKey;
    this.symmetric = event.altKey;
    if (this.gesture) {
      event.stopImmediatePropagation();
      this.gesture.moved ||=
        Math.hypot(event.clientX - this.gesture.screen.x, event.clientY - this.gesture.screen.y) >=
        this.gesture.threshold;
    }
    this.editor.refresh();
  };
  private release = (event: PointerEvent): void => {
    if (!this.gesture || this.gesture.id !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.move(event);
    this.consumeClick = true;
    this.lease?.releaseCapture();
    void this.create();
  };
  private async create(): Promise<void> {
    const bounds = this.bounds();
    const lease = this.lease;
    if (!bounds || !lease) return;
    if (Math.min(bounds.width, bounds.height) < 1e-7) {
      this.gesture = null;
      this.editor.message = "Drag a rectangle with nonzero width and height";
      this.editor.refresh();
      return;
    }
    if (!lease.close()) return;
    const sketch = rectangle(emptySketch(bounds.plane), bounds.a, bounds.b).sketch;
    const success = await this.editor.editSketch(sketch, { kind: "direct" }, lease);
    if (!success) {
      lease.phase = "editing";
      this.gesture = null;
      this.editor.refresh();
      return;
    }
    const accepted = this.editor.store.data.sketches.find((s) => s.id === sketch.id);
    const profile = accepted && profilesFor(accepted)[0];
    this.cancel();
    if (!profile) {
      this.editor.message = "The rectangle has no closed region to extrude";
      this.editor.refresh();
      return;
    }
    this.editor.modeling.targets = [{ kind: "profile", sketch: sketch.id, profile }];
    this.editor.notice = "Extrude · Drag the arrow or edit the depth · Click away to finish";
    if (!this.extrude(Math.min(bounds.width, bounds.height), bounds.symmetric))
      this.editor.message = "Select the rectangle region to extrude";
    this.editor.refresh();
  }
  private cancel(): void {
    this.consumeClick ||= !!this.gesture;
    this.lease?.release();
    this.lease = null;
    this.gesture = null;
    this.pointer = null;
    this.preview.hide();
    this.editor.notice = "";
    this.editor.refresh();
  }
  dispose(): void {
    this.cancel();
    this.abort.abort();
    this.unregister();
    this.editor.world.changed.delete(this.update);
    this.preview.dispose();
  }
}
