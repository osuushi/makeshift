import type * as THREE from "three";
import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import type { Vector } from "../sketch/planes.js";
import { toolCatalog } from "../tools/catalog.js";
import { BufferedPointer } from "./buffered-pointer.js";
import { MovementShadows } from "./movement-shadows.js";
import type { ScaleSource } from "./scale.js";
import { scaleSelection } from "./scale-selection.js";
import { previewBoxMove, translatedSketchFrames } from "./transform-box-preview.js";
import { pointOnTransformPlane, transformPlane } from "./transform-plane.js";

type Drag = {
  id: number;
  origin: Vector;
  start: THREE.Vector3;
  plane: THREE.Plane;
  source: ScaleSource;
  lease: InteractionLease;
  moved: boolean;
  valid: boolean;
  pending: Vector | null;
  running: Promise<void> | null;
  delta: Vector;
};

/** Command-drag the selected box in the same plane used by its sphere anchor. */
export class TransformBoxMove {
  private shadows: MovementShadows;
  private pointer: { x: number; y: number; command: boolean; canvas: boolean } | null = null;
  private abort = new AbortController();
  private drag: Drag | null = null;
  private handoff: BufferedPointer | null = null;
  private ignoreClick = false;
  constructor(private editor: SketchEditor) {
    this.shadows = new MovementShadows(editor);
    editor.world.changed.add(this.previewHover);
    const options = { signal: this.abort.signal };
    window.addEventListener(
      "pointerdown",
      () => {
        this.ignoreClick = false;
      },
      { ...options, capture: true },
    );
    window.addEventListener(
      "click",
      (event) => {
        if (!this.ignoreClick || event.target !== editor.world.canvas) return;
        this.ignoreClick = false;
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      { ...options, capture: true },
    );
    window.addEventListener("pointermove", this.hover, options);
    window.addEventListener("keyup", this.hoverKey, options);
    window.addEventListener("keydown", this.hoverKey, options);
    window.addEventListener(
      "blur",
      () => {
        this.pointer = null;
        this.shadows.hide();
      },
      options,
    );
    editor.world.canvas.addEventListener("pointerdown", this.start, options);
    window.addEventListener("pointermove", this.move, options);
    window.addEventListener("pointerup", this.release, options);
    window.addEventListener("pointercancel", () => void this.cancel(), options);
    window.addEventListener("blur", () => void this.cancel(), options);
    onModelKeydown(
      (event) => {
        if (this.drag && event.key === "Escape") {
          event.preventDefault();
          event.stopImmediatePropagation();
          void this.cancel();
        }
      },
      { ...options, capture: true },
    );
  }
  private hover = (event: PointerEvent): void => {
    this.pointer = {
      x: event.clientX,
      y: event.clientY,
      command: event.metaKey,
      canvas: event.target === this.editor.world.canvas,
    };
    this.previewHover();
  };
  private hoverKey = (event: KeyboardEvent): void => {
    if (this.pointer) this.pointer.command = event.metaKey;
    this.previewHover();
  };
  private previewHover = (): void => {
    if (this.drag) return;
    const e = this.editor,
      p = this.pointer;
    if (
      !p?.command ||
      !p.canvas ||
      e.world.active ||
      e.blocked ||
      e.interactions.current ||
      !e.world.transformBoxContains?.(p.x, p.y)
    ) {
      this.shadows.hide();
      return;
    }
    const source = scaleSelection(e),
      anchor = e.transformAnchor?.point;
    if (source && anchor) this.shadows.prepare(source, anchor, transformPlane(e, anchor));
    else this.shadows.hide();
  };
  private start = async (event: PointerEvent): Promise<void> => {
    const editor = this.editor;
    if (
      event.button ||
      !event.metaKey ||
      this.drag ||
      this.handoff ||
      !editor.world.transformBoxContains?.(event.clientX, event.clientY)
    )
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    let released = false;
    let last = { x: event.clientX, y: event.clientY };
    if (editor.interactions.current) {
      const buffer = new BufferedPointer(event, this.abort.signal);
      this.handoff = buffer;
      let finished: boolean;
      try {
        finished = await toolCatalog(editor).activate({ reason: () => null, run: () => true });
      } finally {
        buffer.dispose();
        this.handoff = null;
      }
      if (!finished || !buffer.valid) return;
      released = buffer.released;
      last = buffer.position;
    }
    if (editor.blocked || editor.interactions.current) return;
    const source = scaleSelection(editor);
    if (!source) return;
    const origin = editor.transformAnchor?.point ?? [0, 0, 0];
    const plane = transformPlane(editor, origin);
    const hit = pointOnTransformPlane(editor, event.clientX, event.clientY, plane);
    if (!hit) return;
    const lease = editor.interactions.acquire("transform-box-move", () => this.cancel());
    if (!lease) return;
    this.drag = {
      id: event.pointerId,
      origin,
      start: hit,
      plane,
      source,
      lease,
      moved: false,
      valid: false,
      pending: null,
      running: null,
      delta: [0, 0, 0],
    };
    this.shadows.begin(source, origin, plane);
    if (!released) lease.capture(editor.world.canvas, event.pointerId);
    if (last.x !== event.clientX || last.y !== event.clientY) {
      this.move(
        new PointerEvent("pointermove", {
          pointerId: event.pointerId,
          clientX: last.x,
          clientY: last.y,
        }),
      );
    }
    if (released) void this.commit(this.drag);
  };
  private move = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || drag.id !== event.pointerId || drag.lease.phase !== "editing") return;
    const hit = pointOnTransformPlane(this.editor, event.clientX, event.clientY, drag.plane);
    if (!hit) return;
    const raw = hit.sub(drag.start);
    const delta = raw.toArray() as Vector;
    drag.moved ||=
      raw.length() > (this.editor.world.height * 3) / this.editor.world.canvas.clientHeight;
    if (!drag.moved) return;
    this.ignoreClick = true;
    if (this.editor.gridSnap) {
      const spacing = this.editor.world.spacing;
      for (let i = 0; i < 3; i++) delta[i] = Math.round(delta[i] / spacing) * spacing;
    }
    drag.pending = delta;
    if (!drag.running) drag.running = this.drain(drag);
  };
  private async drain(drag: Drag): Promise<void> {
    while (drag.pending && drag.lease.phase === "editing") {
      const delta = drag.pending;
      drag.pending = null;
      drag.valid = false;
      const candidate = await previewBoxMove(
        this.editor,
        drag.source,
        drag.origin,
        delta,
        drag.lease,
      );
      if (drag.lease.phase === "editing" && !drag.pending) {
        drag.valid = candidate;
        if (candidate) {
          drag.delta = delta;
          this.shadows.move(drag.origin.map((v, i) => v + delta[i]) as Vector);
        }
      }
      this.editor.refresh();
    }
    drag.running = null;
  }
  private release = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.id) return;
    this.move(event);
    void this.commit(drag);
  };
  private async commit(drag: Drag): Promise<void> {
    drag.lease.releaseCapture();
    await drag.running;
    if (!drag.moved || !drag.valid || drag.delta.every((value) => value === 0)) {
      await this.cancel();
      return;
    }
    const source = drag.source,
      delta = drag.delta;
    const frames =
      source.kind === "sketches"
        ? translatedSketchFrames(this.editor.store.data, source.ids, delta)
        : [];
    if (!frames) {
      await this.cancel();
      return;
    }
    if (!drag.lease.close()) {
      await this.cancel();
      return;
    }
    if (source.kind === "sketches") {
      await this.editor.store.request({
        kind: "place-sketch",
        ...frames[0],
        additional: frames.slice(1),
      });
    } else if (source.kind === "solids" && !source.faces.length && !source.edges.length) {
      await this.editor.store.request({
        kind: "transform-bodies",
        transform: {
          ids: source.ids,
          pivot: drag.origin,
          axis: [0, 0, 1],
          angle: 0,
          translation: delta,
          duplicate: false,
        },
      });
    } else await this.editor.accept();
    this.drag = null;
    this.shadows.hide();
    this.pointer = null;
    drag.lease.release();
    this.editor.refresh();
  }
  private async cancel(): Promise<void> {
    this.handoff?.cancel();
    const drag = this.drag;
    if (!drag?.lease.close()) return;
    this.drag = null;
    this.shadows.hide();
    this.pointer = null;
    drag.pending = null;
    drag.lease.show(null);
    if (
      drag.source.kind === "curves" ||
      (drag.source.kind === "solids" && (drag.source.faces.length || drag.source.edges.length))
    )
      await this.editor.store.cancelPreview();
    await drag.running;
    drag.lease.release();
    this.editor.refresh();
  }
  dispose(): void {
    void this.cancel();
    this.abort.abort();
    this.shadows.dispose();
    this.editor.world.changed.delete(this.previewHover);
  }
}
