import type { SketchEditor } from "../sketch/editor.js";
import { modelingSketch } from "../sketch/model-selection.js";
import { type ModelingTarget, modelingKey } from "../sketch/model-selection-state.js";
import type { TagControls } from "../tags/controls.js";
import { TagRows } from "../tags/rows.js";
import { toolCatalog } from "../tools/catalog.js";
import { bodyAppearanceControl } from "./body-appearance-control.js";
import { entityRows } from "./entity-presentation.js";
import { renameEntity } from "./entity-rename.js";
import { EntityReorder } from "./entity-reorder.js";

export class EntityViewer {
  sourcePicker: {
    choose?: (target: ModelingTarget) => void;
    hover: (target: ModelingTarget | null) => void;
    selected: (target: ModelingTarget) => boolean;
    available?: (target: ModelingTarget) => boolean;
    role?: (target: ModelingTarget) => "target" | "tool" | "input" | undefined;
  } | null = null;
  readonly operationRows = document.createElement("section");
  readonly referenceRows = document.createElement("section");
  private root = document.createElement("aside");
  private key = "";
  private tags: TagRows;
  private refreshRows: (() => void)[] = [];
  private selectionRows: ModelingTarget[] = [];
  private selectionAnchor: string | null = null;
  get element(): HTMLElement {
    return this.root;
  }
  constructor(
    private editor: SketchEditor,
    app: HTMLElement,
    tags: TagControls,
  ) {
    this.tags = new TagRows(editor, tags);
    this.root.className = "entity-viewer";
    this.root.setAttribute("aria-label", "Entities");
    app.append(this.root);
    editor.world.changed.add(this.update);
    this.update();
  }
  private async select(target: ModelingTarget, event: MouseEvent): Promise<void> {
    if (this.sourcePicker?.choose) {
      this.sourcePicker.choose(target);
      return;
    }
    await toolCatalog(this.editor).activate({
      reason: () => null,
      run: () => this.selectAccepted(target, event),
    });
  }
  private selectAccepted(target: ModelingTarget, event: MouseEvent): void {
    const index = this.selectionRows.findIndex((row) => modelingKey(row) === modelingKey(target));
    if (index < 0) return;
    const anchor = this.selectionRows.findIndex((row) => modelingKey(row) === this.selectionAnchor);
    const toggle = event.metaKey || event.ctrlKey;
    this.editor.world.exit();
    if (event.shiftKey && !toggle && anchor >= 0) {
      this.editor.modeling.targets = this.selectionRows.slice(
        Math.min(anchor, index),
        Math.max(anchor, index) + 1,
      );
    } else {
      this.editor.modeling.choose(target, false, toggle);
      this.selectionAnchor = modelingKey(target);
    }
    this.editor.modeling.alternatives = [];
    this.editor.refresh();
  }
  private async merge(sourceId: string): Promise<void> {
    await toolCatalog(this.editor).activate({
      reason: () => null,
      run: () => this.mergeAccepted(sourceId),
    });
  }
  private async mergeAccepted(sourceId: string): Promise<void> {
    const target = modelingSketch(this.editor);
    if (!target || !this.editor.mergeableSketches.some((sketch) => sketch.id === sourceId)) return;
    if (
      !(await this.editor.store.request({
        kind: "merge-sketches",
        targetSketchId: target.id,
        sourceSketchIds: [sourceId],
      }))
    )
      return;
    this.editor.modeling.targets = [{ kind: "sketch", sketch: target.id }];
    this.editor.modeling.alternatives = [];
    this.editor.notice = "Merged sketch";
    this.editor.refresh();
  }
  private label(id: string, name: string, target: ModelingTarget): HTMLButtonElement {
    const select = document.createElement("button");
    select.textContent = name;
    select.setAttribute("aria-label", `Select ${name}`);
    select.onclick = (event) => this.select(target, event);
    select.onpointerenter = () => this.sourcePicker?.hover(target);
    select.onpointerleave = () => this.sourcePicker?.hover(null);
    select.ondblclick = (event) => {
      if (event.shiftKey || event.metaKey || event.ctrlKey) return;
      renameEntity(this.editor, select, id);
    };
    return select;
  }
  private row(id: string, name: string, target: ModelingTarget): HTMLElement {
    this.selectionRows.push(target);
    const row = document.createElement("div");
    row.className = "entity-row";
    const select = this.label(id, name, target),
      eye = document.createElement("button");
    new EntityReorder(this.editor, row, select, id, target.kind, () => !!this.sourcePicker);

    eye.onclick = () => {
      void toolCatalog(this.editor).activate({
        reason: () => null,
        run: () => {
          if (
            !this.editor.store.data.bodies?.some((body) => body.id === id) &&
            !this.editor.store.data.sketches.some((sketch) => sketch.id === id)
          )
            return;
          const visible = this.editor.visibility.visible(id);
          if (visible) this.editor.visibility.hide(id);
          else {
            this.editor.visibility.show(id);
            if (target.kind === "body") this.editor.bodiesVisible = true;
          }
          if (visible && this.editor.world.workspace?.sketchId === id) this.editor.world.exit();
          this.editor.modeling.targets = this.editor.modeling.targets.filter(
            (t) =>
              t.sketch !== id &&
              !((t.kind === "body" || t.kind === "face" || t.kind === "edge") && t.body === id),
          );
          this.editor.modeling.hover = null;
          this.editor.refresh();
        },
      });
    };
    const merge = target.kind === "sketch" ? document.createElement("button") : undefined;
    if (merge) {
      merge.className = "entity-merge";
      merge.textContent = "↔";
      merge.setAttribute("aria-label", `Merge ${name} into selected sketch`);
      merge.title = "Merge into selected sketch";
      merge.onclick = (event) => {
        event.stopPropagation();
        void this.merge(id);
      };
    }
    let shown: boolean | undefined;
    this.refreshRows.push(() => {
      const role = this.sourcePicker?.role?.(target);
      row.dataset.booleanRole = role ?? "";
      select.title = role
        ? `${name} · ${role === "input" ? "Selected" : role === "target" ? "Target" : "Cutting tool"}`
        : name;
      const selected = this.editor.modeling.targets.some((t) =>
        target.kind === "sketch"
          ? t.sketch === id
          : (t.kind === "body" || t.kind === "face" || t.kind === "edge") && t.body === id,
      );
      select.setAttribute(
        "aria-pressed",
        String(
          this.sourcePicker
            ? this.sourcePicker.selected(target)
            : selected || this.editor.world.workspace?.sketchId === id,
        ),
      );
      const visible = this.editor.visibility.visible(id);
      const mergeable =
        target.kind === "sketch" &&
        this.editor.mergeableSketches.some((sketch) => sketch.id === id);
      if (shown !== visible) {
        shown = visible;
        eye.setAttribute("aria-label", `${visible ? "Hide" : "Show"} ${name}`);
        eye.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>${visible ? "" : '<path d="m3 3 18 18"/>'}</svg>`;
      }
      eye.disabled = !!toolCatalog(this.editor).reason({ reason: () => null });
      row.classList.toggle("entity-mergeable", mergeable);
      if (merge) {
        merge.hidden = !mergeable;
        merge.disabled = !!toolCatalog(this.editor).reason({ reason: () => null });
      }
      select.disabled = this.sourcePicker
        ? this.editor.blocked || this.sourcePicker.available?.(target) === false
        : !!toolCatalog(this.editor).reason({ reason: () => null });
      row.classList.toggle("entity-hidden", !visible);
    });
    row.append(select, ...(merge ? [merge] : []));
    if (target.kind === "body")
      row.append(bodyAppearanceControl(this.editor, id, name, this.refreshRows));
    row.append(eye);
    return target.kind === "body" ? this.tags.wrap(row, id, this.refreshRows) : row;
  }
  private update = (): void => {
    const editor = this.editor,
      data = editor.store.data;
    const key = JSON.stringify([
      data.sketches.map((s) => s.id),
      data.bodies?.map((b) => b.id),
      data.entityPresentation,
      data.taggedGroups,
    ]);
    if (key === this.key) {
      for (const refresh of this.refreshRows) refresh();
      return;
    }
    this.key = key;
    this.root.replaceChildren();
    this.refreshRows = [];
    this.selectionRows = [];
    const title = document.createElement("h2");
    title.textContent = "Entities";
    this.root.append(title, this.operationRows);
    for (const [label, rows] of [
      [
        "Bodies",
        entityRows(
          data,
          (data.bodies ?? []).map((b) => b.id),
          "Body",
        ).map((b) => this.row(b.id, b.name, { kind: "body", body: b.id })),
      ],
      [
        "Sketches",
        entityRows(
          data,
          data.sketches.map((s) => s.id),
          "Sketch",
        ).map((s) => this.row(s.id, s.name, { kind: "sketch", sketch: s.id })),
      ],
    ] as const) {
      const heading = document.createElement("h3");
      heading.textContent = `${label} (${rows.length})`;
      this.root.append(heading, ...rows);
    }
    for (const refresh of this.refreshRows) refresh();
    if (!this.selectionRows.some((row) => modelingKey(row) === this.selectionAnchor))
      this.selectionAnchor = null;
    this.root.append(this.referenceRows);
  };
  dispose(): void {
    this.editor.world.changed.delete(this.update);
    this.root.remove();
  }
}
