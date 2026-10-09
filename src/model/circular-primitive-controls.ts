import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { PlaneFrame, Point } from "../sketch/planes.js";
import { pointerDragThreshold } from "../sketch/pointer-intent.js";
import { toolCatalog } from "../tools/catalog.js";
import { CircularPrimitivePreview } from "./circular-primitive-preview.js";
import { cubeDefaultSize, cubeHoverPlane } from "./cube-rectangle.js";
import type { PlaneReferenceSource } from "./plane-interior-pick.js";

export type CircularPrimitiveShape = "cylinder" | "sphere" | "cone" | "drill";
export type CircularPlacement = {
  plane: PlaneFrame;
  center: Point;
  radius: number;
  symmetric: boolean;
  source?: PlaneReferenceSource;
  depth?: number;
};
type Support = { frame: PlaneFrame; source?: PlaneReferenceSource; depth?: number };
export type CircularPrimitiveConfig = {
  id: CircularPrimitiveShape;
  label: string;
  hint: string;
  description: string;
  aliases?: string[];
  shape: CircularPrimitiveShape;
  plane?: (screen: Point) => Support | null;
  create: (placement: CircularPlacement, lease: InteractionLease) => Promise<void>;
};

/** Owns circle placement only, then yields to ordinary sketch and solid tools. */
export class CircularPrimitiveControls {
  private abort = new AbortController();
  private unregister: () => void;
  private preview: CircularPrimitivePreview;
  private lease: InteractionLease | null = null;
  private pointer: Point | null = null;
  private gesture: {
    id: number;
    screen: Point;
    center: Point;
    support: Support;
    radius: number;
    threshold: number;
    moved: boolean;
  } | null = null;
  private symmetric = false;
  private consumeClick = false;
  private creating = false;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
    private config: CircularPrimitiveConfig,
  ) {
    this.preview = new CircularPrimitivePreview(editor.world, overlay, config.shape);
    this.unregister = toolCatalog(editor).register({
      id: config.id,
      label: config.label,
      category: "Solid",
      aliases: config.aliases ?? [],
      description: config.description,
      reason: () => null,
      run: () => this.begin(),
    });
    this.bindEvents();
    editor.world.changed.add(this.update);
  }
  private bindEvents(): void {
    const options = { signal: this.abort.signal, capture: true };
    const canvas = this.editor.world.canvas;
    canvas.addEventListener("pointerdown", this.press, options);
    canvas.addEventListener("pointermove", this.move, options);
    canvas.addEventListener("pointerup", this.release, options);
    canvas.addEventListener("pointercancel", () => this.cancel(), options);
    canvas.addEventListener(
      "pointerleave",
      () => {
        if (!this.gesture) {
          this.pointer = null;
          this.preview.hide();
          this.editor.world.present();
        }
      },
      options,
    );
    canvas.addEventListener(
      "click",
      (event) => {
        if (this.consumeClick || this.lease || this.creating) {
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
          if (!this.lease || event.key !== "Alt") return;
          this.symmetric = event.altKey;
          this.editor.refresh();
        },
        options,
      );
    window.addEventListener("blur", () => this.gesture && this.cancel(), options);
  }
  private begin(): boolean {
    if (this.creating) return false;
    const editor = this.editor;
    if (editor.world.active) editor.world.exit();
    this.lease = editor.interactions.acquire(
      this.config.id,
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
    editor.notice = this.config.hint;
    this.pointer = null;
    this.symmetric = false;
    this.consumeClick = false;
    editor.refresh();
    return true;
  }
  private support(screen: Point): Support | null {
    return this.config.plane
      ? this.config.plane(screen)
      : { frame: cubeHoverPlane(this.editor, screen) };
  }
  private snap(point: Point): Point {
    const spacing = this.editor.gridSnap ? this.editor.world.spacing : 0;
    return spacing
      ? { x: Math.round(point.x / spacing) * spacing, y: Math.round(point.y / spacing) * spacing }
      : point;
  }
  private placement(): CircularPlacement | null {
    if (!this.pointer) return null;
    const support = this.gesture?.support ?? this.support(this.pointer);
    if (!support) return null;
    const point = this.editor.world.pointAt(support.frame, this.pointer.x, this.pointer.y);
    if (!point) return null;
    const center = this.gesture?.center ?? this.snap(point);
    const tip = this.snap(point);
    return {
      plane: support.frame,
      center,
      radius: this.gesture?.moved
        ? Math.hypot(tip.x - center.x, tip.y - center.y)
        : (this.gesture?.radius ?? cubeDefaultSize(this.editor.world, support.frame) / 2),
      symmetric: this.config.shape !== "drill" && this.symmetric,
      source: support.source,
      depth: support.depth,
    };
  }
  private update = (): void => {
    if (!this.lease) return;
    const placement = this.placement();
    if (placement) this.preview.show(placement);
    else this.preview.hide();
  };
  private press = (event: PointerEvent): void => {
    if (this.creating) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    this.consumeClick = false;
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
    const screen = { x: event.clientX, y: event.clientY };
    const support = this.support(screen);
    const world = this.editor.world;
    const point = support && world.pointAt(support.frame, screen.x, screen.y);
    if (!support || !point) return;
    world.canvas.focus();
    this.editor.message = "";
    this.pointer = screen;
    this.symmetric = event.altKey;
    this.gesture = {
      id: event.pointerId,
      screen,
      center: this.snap(point),
      support,
      radius: cubeDefaultSize(world, support.frame) / 2,
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
    const placement = this.placement();
    if (!placement || !this.lease) return;
    if (placement.radius < 1e-7) {
      this.gesture = null;
      this.editor.message = "Drag a circle with a nonzero radius";
      this.editor.refresh();
      return;
    }
    const lease = this.lease;
    if (!lease.close()) return;
    this.creating = true;
    this.lease = null;
    this.gesture = null;
    this.pointer = null;
    this.preview.hide();
    this.editor.notice = "";
    this.editor.refresh();
    try {
      await this.config.create(placement, lease);
    } catch (error) {
      this.editor.message = error instanceof Error ? error.message : String(error);
    } finally {
      lease.release();
      this.creating = false;
      this.editor.refresh();
    }
  }
  private cancel(): void {
    if (!this.lease) return;
    this.consumeClick ||= this.lease.captured;
    this.lease.release();
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
