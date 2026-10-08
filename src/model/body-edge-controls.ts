import * as THREE from "three";
import type { InteractionLease } from "../sketch/active-interaction.js";
import { curveDistance } from "../sketch/curve-geometry.js";
import { emptySketch, newId } from "../sketch/document.js";
import type { SketchEditor } from "../sketch/editor.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";
import type { Edge } from "./body.js";
import { copyEdge } from "./copy-edge.js";
import { planarBodyEdges } from "./planar-body-edges.js";

export class BodyEdgeControls {
  private disposeTool: () => void;
  private lease: InteractionLease | null = null;
  private abort = new AbortController();
  private hover: Edge | null = null;
  private drawn: Edge | null = null;
  private outline = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: "#d28b22", depthTest: false }),
  );
  constructor(private editor: SketchEditor) {
    this.outline.renderOrder = 15;
    editor.world.scene.add(this.outline);
    this.disposeTool = toolCatalog(editor).register({
      id: "use-edge",
      finishEdit: () => !this.lease,
      label: "Use body edge",
      category: "Reference",
      aliases: ["reuse edge", "copy edge"],
      reason: () =>
        this.lease
          ? null
          : (idleReason(editor) ??
            (!editor.world.active || !editor.bodiesVisible || !this.eligible().length
              ? "Open a sketch plane containing visible body edges"
              : null)),
      run: async () => {
        if (this.lease) {
          this.cancel();
          return;
        }
        if (editor.blocked) return;
        await editor.setTool("select");
        this.lease = editor.interactions.acquire("use-edge", () => this.cancel(), undefined, {
          navigation: "when-released",
        });
        editor.refresh();
      },
    });
    const options = { signal: this.abort.signal, capture: true };
    editor.world.canvas.addEventListener(
      "pointermove",
      (event) => {
        if (!this.lease) return;
        this.hover = this.pick(event);
        editor.refresh();
        if (event.buttons === 0) event.stopImmediatePropagation();
      },
      options,
    );
    editor.world.canvas.addEventListener(
      "pointerdown",
      (event) => {
        if (!this.lease || event.button !== 0) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const edge = this.pick(event);
        if (edge && !editor.blocked) void this.copy(edge, !event.shiftKey);
      },
      options,
    );
    editor.world.canvas.addEventListener(
      "pointerup",
      (event) => {
        if (this.lease && event.button === 0) event.stopImmediatePropagation();
      },
      options,
    );
    editor.world.changed.add(this.update);
    this.update();
  }
  private eligible() {
    const frame = this.editor.world.activeFrame;
    return frame
      ? planarBodyEdges(this.editor.store.data, frame).filter(({ edge }) =>
          this.editor.store.data.bodies?.some(
            (b) => this.editor.visibility.visible(b.id) && b.edges.includes(edge),
          ),
        )
      : [];
  }
  private pick(event: PointerEvent): Edge | null {
    const frame = this.editor.world.activeFrame;
    if (!frame) return null;
    const point = this.editor.world.pointAt(frame, event.clientX, event.clientY);
    if (!point) return null;
    const tolerance = (7 * this.editor.world.height) / this.editor.world.canvas.clientHeight;
    return (
      this.eligible()
        .map(({ edge, curve }) => ({ edge, distance: curveDistance(curve, point) }))
        .filter(({ distance }) => distance < tolerance)
        .sort((a, b) => a.distance - b.distance)[0]?.edge ?? null
    );
  }
  private async copy(edge: Edge, attach: boolean): Promise<void> {
    const editor = this.editor,
      frame = editor.world.activeFrame;
    if (!frame || !this.lease) return;
    const base = editor.sketch ?? {
      ...emptySketch(frame),
      id: editor.world.workspace?.sketchId ?? newId(),
    };
    try {
      const result = copyEdge(base, edge, attach);
      if (result === base) return;
      if (await editor.editSketch(result, { kind: "direct" }, this.lease)) {
        editor.select([result.curves[result.curves.length - 1].id]);
        editor.notice = "Copied edge into this sketch";
      }
    } catch (error) {
      editor.message = error instanceof Error ? error.message : String(error);
    }
    editor.refresh();
  }
  private cancel(): void {
    const lease = this.lease;
    this.lease = null;
    this.hover = null;
    lease?.release();
    this.editor.refresh();
  }
  private update = (): void => {
    if (!this.editor.world.active && this.lease) {
      this.cancel();
      return;
    }
    this.outline.visible = !!this.lease && !!this.hover;
    if (this.drawn === this.hover) return;
    this.drawn = this.hover;
    this.outline.geometry.dispose();
    this.outline.geometry = new THREE.BufferGeometry();
    if (this.hover)
      this.outline.geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(this.hover.points, 3),
      );
  };
  dispose(): void {
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.disposeTool();
    this.outline.geometry.dispose();
    this.outline.material.dispose();
    this.editor.world.scene.remove(this.outline);
  }
}
