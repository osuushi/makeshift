import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import { type PlaneId, planes } from "../sketch/planes.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";
import type { MirrorOperation } from "./mirror.js";
import { MirrorHover } from "./mirror-hover.js";
import {
  type MirrorReference,
  offsetReference,
  pickMirrorReference,
  planeReference,
} from "./mirror-reference.js";
import { MirrorReferenceView } from "./mirror-reference-view.js";
import { MirrorWidget } from "./mirror-widget.js";
import "./mirror.css";

type Source =
  | { kind: "sketch"; sketchId: string; ids: string[] }
  | { kind: "bodies"; ids: string[] };
export class MirrorControls {
  private disposeTool: () => void;
  private widget: MirrorWidget;
  private referenceView: MirrorReferenceView;
  private hoverView: MirrorHover;
  private abort = new AbortController();
  private lease: InteractionLease | null = null;
  private source: Source | null = null;
  private reference: MirrorReference | null = null;
  private previousSelection: SketchEditor["selected"]["targets"] = [];
  private previousModels: SketchEditor["modeling"]["targets"] = [];
  private valid = false;
  private pending: MirrorOperation | null = null;
  private latest: MirrorOperation | null = null;
  private running: Promise<void> | null = null;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.disposeTool = toolCatalog(editor).register({
      id: "mirror",
      finishEdit: true,
      label: "Mirror",
      category: "Transform",
      aliases: ["reflect", "reflection"],
      reason: () =>
        idleReason(editor) ??
        (this.selected() ? null : "Select compatible sketch geometry or solid geometry"),
      run: () => this.begin(),
    });
    this.widget = new MirrorWidget(overlay);
    this.referenceView = new MirrorReferenceView(editor);
    this.hoverView = new MirrorHover(editor, () => !!this.lease && !editor.blocked);
    this.widget.accept.onclick = () => void this.finish();
    this.widget.cancel.onclick = () => void this.cancel();
    this.widget.offset.oninput = () => this.queue();
    this.widget.keep.onchange = () => this.queue();
    this.events();
    editor.world.changed.add(this.update);
    this.update();
  }
  private selected(): Source | null {
    const e = this.editor;
    if (e.world.active) {
      const ids = [...e.selectedCurves];
      return e.sketch && ids.length && !e.selected.points.length
        ? { kind: "sketch", sketchId: e.sketch.id, ids }
        : null;
    }
    const result = e.modeling.resolve("mirror");
    return result.available ? { kind: "bodies", ids: result.inputs.map((b) => b.id) } : null;
  }
  async reopen(operation: MirrorOperation): Promise<void> {
    this.begin(operation);
    if (!this.lease) throw new Error("Cannot restore mirror inputs");
    this.queue();
    await this.running;
    if (!this.valid) throw new Error("Cannot regenerate the accepted mirror");
    this.widget.offset.focus();
    this.widget.offset.select();
  }
  private begin(restored?: MirrorOperation): void {
    const e = this.editor,
      source = restored
        ? restored.kind === "sketch"
          ? { kind: "sketch" as const, sketchId: restored.sketchId, ids: [...restored.ids] }
          : { kind: "bodies" as const, ids: [...restored.ids] }
        : this.selected();
    if (!source || e.blocked || e.interactions.current) return;
    this.lease = e.interactions.acquire(
      "mirror",
      () => this.cancel(),
      () => this.finish(),
      {
        navigation: "when-released",
        settled: async () => {
          await this.running;
        },
      },
    );
    if (!this.lease) return;
    this.source = source;
    this.previousSelection = e.selected.targets;
    this.previousModels = e.modeling.targets;
    this.reference = restored
      ? restored.kind === "sketch"
        ? { kind: "line", line: structuredClone(restored.line) }
        : { kind: "plane", plane: structuredClone(restored.plane) }
      : null;
    this.valid = false;
    this.latest = this.pending = null;
    this.widget.open(e);
    if (restored) this.widget.keep.checked = restored.keepOriginal;
    this.lease.trackHistory(
      this.widget.root,
      () => ({
        reference: this.reference,
        offset: this.widget.offset.value,
        keep: this.widget.keep.checked,
      }),
      async (state) => {
        this.reference = state.reference;
        this.widget.offset.value = state.offset;
        this.widget.keep.checked = state.keep;
        this.queue();
        await this.running;
      },
    );
    e.select([]);
    e.modeling.targets = [];
    e.modeling.hover = null;
    e.message = "";
    e.notice =
      source.kind === "sketch"
        ? "Mirror · Pick a sketch axis or straight line"
        : "Mirror · Pick a world plane or planar face";
    if (source.kind === "bodies") e.world.planePicker = (id) => this.choosePlane(id);
    e.refresh();
  }
  private choosePlane(id: PlaneId): void {
    if (!this.lease || this.editor.blocked) return;
    this.reference = planeReference(planes[id]);
    this.widget.offset.value = "0";
    this.queue();
    this.lease.history?.checkpoint();
  }
  private events(): void {
    const e = this.editor,
      options = { signal: this.abort.signal, capture: true };
    e.world.canvas.addEventListener(
      "pointerdown",
      (event) => {
        if (!this.lease || event.button || event.ctrlKey || event.metaKey) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      options,
    );
    e.world.canvas.addEventListener(
      "click",
      (event) => {
        if (!this.lease || event.button || event.ctrlKey || event.metaKey) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (e.blocked) return;
        const reference = pickMirrorReference(e, { x: event.clientX, y: event.clientY });
        if (!reference) {
          e.message = "Pick a sketch axis, straight line, world plane or planar face";
          e.refresh();
          return;
        }
        this.reference = reference;
        this.widget.offset.value = "0";
        this.queue();
        this.lease?.history?.checkpoint();
      },
      options,
    );
    e.world.canvas.addEventListener(
      "dblclick",
      (event) => {
        if (this.lease) event.stopImmediatePropagation();
      },
      options,
    );
    e.world.canvas.addEventListener(
      "pointermove",
      (event) => {
        if (!this.lease || event.buttons) return;
        event.stopImmediatePropagation();
      },
      options,
    );
    onModelKeydown((event) => {
      if (!this.lease) return;
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "z")
        return;
      if (event.key === "Escape" || event.key === "Enter") {
        event.preventDefault();
        if (event.key === "Escape") void this.cancel();
        else void this.finish();
      }
      // The tool owns CAD shortcuts while text input and camera gestures stay ordinary.
      event.stopImmediatePropagation();
    }, options);
  }
  private queue(): void {
    const source = this.source,
      reference = this.reference;
    if (this.lease?.phase !== "editing" || !source) return;
    this.valid = false;
    const value = this.widget.offset.value.trim();
    const offset = value ? Number(value) : NaN;
    this.widget.offset.setAttribute("aria-invalid", String(!Number.isFinite(offset)));
    this.pending = this.latest = null;
    this.lease.show(null);
    if (!Number.isFinite(offset) || !reference) {
      this.editor.refresh();
      return;
    }
    const adjusted = offsetReference(reference, offset),
      keepOriginal = this.widget.keep.checked;
    if (source.kind === "sketch" && adjusted.kind === "line")
      this.pending = { ...source, line: adjusted.line, keepOriginal };
    if (source.kind === "bodies" && adjusted.kind === "plane")
      this.pending = { ...source, plane: adjusted.plane, keepOriginal };
    this.latest = this.pending;
    if (!this.running && this.pending) this.running = this.drain();
    this.editor.refresh();
  }
  private async drain(): Promise<void> {
    while (this.pending && this.lease?.phase === "editing") {
      const operation = this.pending;
      this.pending = null;
      const success = await this.editor.store.request({ kind: "mirror", operation });
      if (this.lease?.phase === "editing" && operation === this.latest) {
        this.valid = success;
        this.lease.show(success ? this.editor.store.candidate : null);
        if (success) this.editor.notice = "Mirror · Enter to accept · Escape to cancel";
      }
      this.editor.refresh();
    }
    this.running = null;
    this.editor.refresh();
  }
  private async finish(): Promise<boolean> {
    await this.running;
    const lease = this.lease,
      source = this.source,
      operation = this.latest;
    if (!lease || !source) return false;
    if (!this.reference) {
      await this.cancel();
      return true;
    }
    if (!this.valid || !operation || !lease.close()) return false;
    const e = this.editor,
      before = e.store.data;
    if (!(await e.accept())) {
      lease.phase = "editing";
      e.refresh();
      return false;
    }
    if (source.kind === "sketch") {
      const oldIds = new Set(
        before.sketches.find((s) => s.id === source.sketchId)?.curves.map((c) => c.id),
      );
      const ids = operation.keepOriginal
        ? (e.store.data.sketches
            .find((s) => s.id === source.sketchId)
            ?.curves.filter((c) => !oldIds.has(c.id))
            .map((c) => c.id) ?? [])
        : source.ids;
      e.select(ids);
      e.tool = "select";
      e.creationArmed = false;
    } else {
      const oldIds = new Set(before.bodies?.map((b) => b.id));
      const ids = operation.keepOriginal
        ? (e.store.data.bodies?.filter((b) => !oldIds.has(b.id)).map((b) => b.id) ?? [])
        : source.ids;
      e.modeling.targets = ids.map((body) => ({ kind: "body", body }));
    }
    this.end(lease);
    return true;
  }
  private async cancel(): Promise<void> {
    const lease = this.lease;
    if (!lease?.close()) return;
    this.pending = null;
    lease.show(null);
    await this.editor.store.cancelPreview();
    await this.running;
    this.editor.selectTargets(this.previousSelection);
    this.editor.modeling.targets = this.previousModels;
    this.end(lease);
  }
  private end(lease: InteractionLease): void {
    this.lease = null;
    this.source = null;
    this.reference = null;
    this.editor.world.planePicker = null;
    this.editor.notice = "";
    this.referenceView.show(null);
    this.hoverView.clear();
    lease.release();
    this.editor.refresh();
  }
  private update = (): void => {
    const e = this.editor;
    this.widget.update(
      !!this.lease,
      this.valid,
      e.blocked || !!this.running,
      this.lease?.phase !== "editing",
    );
    const offset = Number(this.widget.offset.value);
    this.referenceView.show(
      this.lease && this.reference && Number.isFinite(offset)
        ? offsetReference(this.reference, offset)
        : null,
    );
  };
  dispose(): void {
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.widget.dispose();
    this.referenceView.dispose();
    this.hoverView.dispose();
    this.disposeTool();
  }
}
