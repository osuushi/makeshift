import { composeAffine } from "../model/affine.js";
import type { SmartObject, SmartObjectEdit } from "../model/smart-object.js";
import { showContentPrompt } from "../security/content-prompt.js";
import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import type { ModelingTarget } from "../sketch/model-selection-state.js";
import {
  idleReason,
  type LinkedToolAction,
  type ToolDefinition,
  toolCatalog,
} from "../tools/catalog.js";
import { selectSource, type TransformMode, transformPlacement } from "./dialogs.js";
import { SmartObjectScene } from "./scene.js";
import { conversionSelection, selectedObjects } from "./selection.js";
import "./smart-objects.css";

const transforms = new Map<string, TransformMode>([
  ["move", "move"],
  ["rotate", "rotate"],
  ["scale", "scale"],
  ["mirror", "mirror"],
  ["transform", "move"],
]);
const geometryTools = new Set([
  "edit-sketch",
  "sketch-on-face",
  "new-sketch-on-plane",
  "merge-sketches",
  "sketch-offset",
  "extrude",
  "revolve",
  "loft",
  "offset",
  "fillet",
  "chamfer",
  "shell",
  "erode",
  "union",
  "subtract",
  "intersect",
  "cleanup",
  "project",
  "plane-cut",
]);

export class SmartObjectControls {
  private root = document.createElement("div");
  private context = document.createElement("span");
  private buttons = new Map<string, { button: HTMLButtonElement; tool: ToolDefinition }>();
  private disposers: (() => void)[] = [];
  private scene: SmartObjectScene;
  private abort = new AbortController();
  constructor(
    private editor: SketchEditor,
    slot: HTMLElement,
  ) {
    this.scene = new SmartObjectScene(editor);
    const catalog = toolCatalog(editor);
    catalog.linkedTool = (id) => this.override(id);
    this.root.className = "smart-object-actions";
    this.context.className = "smart-object-context";
    this.root.append(this.context);
    slot.append(this.root);
    this.registerActions();
    editor.world.changed.add(this.update);
    onModelKeydown(
      (event) => {
        if (
          event.key !== "Escape" ||
          editor.world.active ||
          editor.interactions.current ||
          editor.modeling.targets.length ||
          !editor.store.benchFocus.inline.length ||
          event.target instanceof HTMLInputElement
        )
          return;
        event.preventDefault();
        event.stopImmediatePropagation();
        void catalog.invoke("exit-smart-object");
      },
      { signal: this.abort.signal, capture: true },
    );
    this.update();
  }

  private registerActions(): void {
    const e = this.editor;
    const selection = () => selectedObjects(e);
    const one = () => (selection().length === 1 ? null : "Select one smart object");
    const sources = () => e.store.benchTabs.filter(({ id }) => id !== e.store.editingBench);
    const convertReason = () =>
      conversionSelection(e) ? null : "Select sketches, whole solids, or smart objects";
    this.action(
      "insert-bench",
      "Insert bench…",
      () => (sources().length ? null : "Create another bench first"),
      async () => {
        const source = await selectSource(sources());
        if (!source) return false;
        const before = new Set((e.store.data.smartObjects ?? []).map(({ id }) => id));
        if (!(await this.edit({ action: "insert", source }))) return false;
        const added = e.store.data.smartObjects?.find(({ id }) => !before.has(id));
        if (added) this.choose([{ kind: "smart-object", instance: added.id }]);
        return true;
      },
    );
    this.action("convert-smart-object", "Make smart object", convertReason, async () => {
      const plan = conversionSelection(e);
      return !!plan && this.edit({ action: "convert", selection: plan });
    });
    this.action(
      "transform-smart-object",
      "Transform…",
      () => (selection().length ? null : "Select a smart object"),
      () => this.transform(selection(), "move"),
    );
    this.action("edit-smart-object", "Edit in place", one, () =>
      this.edit({ action: "enter", id: selection()[0].id }),
    );
    this.action("open-smart-source", "Open source bench", one, () =>
      this.edit({ action: "source", id: selection()[0].id }),
    );
    this.action(
      "detach-smart-object",
      "Make independent…",
      () => (selection().length ? null : "Select a smart object"),
      () => this.detach(selection()),
    );
    this.action(
      "exit-smart-object",
      "Done editing in place",
      () => (e.store.benchFocus.inline.length ? null : "Edit a smart object in place first"),
      () => this.edit({ action: "exit" }),
    );
  }

  private action(
    id: string,
    label: string,
    reason: () => string | null,
    run: () => Promise<boolean>,
  ) {
    const catalog = toolCatalog(this.editor);
    const tool: ToolDefinition = {
      id,
      label,
      category: "Document & Edit",
      reason: () => idleReason(this.editor) ?? reason(),
      run,
    };
    this.disposers.push(catalog.register(tool));
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.onclick = () => void catalog.invoke(id);
    this.buttons.set(id, { button, tool });
    this.root.append(button);
  }

  private override(id: string): LinkedToolAction | undefined {
    const mode = transforms.get(id);
    const duplicate = id === "duplicate";
    const editsGeometry = geometryTools.has(id);
    if (!mode && !duplicate && !editsGeometry) return undefined;
    if (this.editor.world.active || this.editor.interactions.current?.selectsLocally())
      return undefined;
    const objects = selectedObjects(this.editor);
    if (!objects.length) return undefined;
    if (editsGeometry) return { beforeEdit: true, run: () => this.detach(objects) };
    const onlyObjects = objects.length === this.editor.modeling.targets.length;
    const reason = onlyObjects ? undefined : "Select just the smart objects for this operation";
    return { reason, run: () => this.transform(objects, mode ?? "move", duplicate) };
  }

  private edit(edit: SmartObjectEdit): Promise<boolean> {
    return this.editor.store.request({ kind: "smart-object", edit });
  }

  private async transform(
    objects: readonly SmartObject[],
    mode: TransformMode,
    duplicate = false,
  ): Promise<boolean> {
    if (!objects.length || this.editor.modeling.targets.length !== objects.length) {
      this.editor.message = "Select just the smart objects to transform";
      return false;
    }
    const change = await transformPlacement(
      objects,
      mode,
      (preview) => {
        this.scene.transformPreview = preview
          ? {
              duplicate,
              transforms: new Map(
                objects.map((object) => [
                  object.id,
                  preview.absolute
                    ? preview.transform
                    : composeAffine(preview.transform, object.transform),
                ]),
              ),
            }
          : undefined;
        this.editor.refresh();
      },
      duplicate,
    );
    if (!change) return false;
    const before = new Set((this.editor.store.data.smartObjects ?? []).map(({ id }) => id));
    const changed = await this.edit({
      action: "transform",
      ids: objects.map(({ id }) => id),
      ...change,
      duplicate,
    });
    if (changed && duplicate)
      this.choose(
        (this.editor.store.data.smartObjects ?? []).flatMap(({ id }) =>
          before.has(id) ? [] : [{ kind: "smart-object", instance: id }],
        ),
      );
    return changed;
  }

  private async detach(objects: readonly SmartObject[]): Promise<boolean> {
    const choice = await showContentPrompt({
      message:
        objects.length === 1
          ? "Make this smart object independent?"
          : "Make these smart objects independent?",
      detail:
        "This replaces the selected placements with editable copies and breaks their links to the source benches. Stretching and shearing can remove incompatible sketch constraints.",
      buttons: ["Cancel", "Make independent"],
      cancelId: 0,
    });
    if (choice !== 1) return false;
    const before = this.editor.store.data;
    const remaining = this.editor.modeling.targets.filter(
      (target) => target.kind !== "smart-object",
    );
    if (!(await this.edit({ action: "detach", ids: objects.map(({ id }) => id) }))) return false;
    const after = this.editor.store.data;
    this.choose([
      ...remaining,
      ...(after.bodies ?? [])
        .filter(({ id }) => !before.bodies?.some((body) => body.id === id))
        .map(({ id }) => ({ kind: "body" as const, body: id })),
      ...after.sketches
        .filter(({ id }) => !before.sketches.some((sketch) => sketch.id === id))
        .map(({ id }) => ({ kind: "sketch" as const, sketch: id })),
    ]);
    return true;
  }

  private choose(targets: ModelingTarget[]): void {
    if (this.editor.world.active) this.editor.world.exit();
    this.editor.modeling.targets = targets;
    this.editor.refresh();
  }

  private update = (): void => {
    const e = this.editor;
    const selection = selectedObjects(e);
    const focus = e.store.benchFocus;
    const catalog = toolCatalog(e);
    const reasons = new Map([...this.buttons].map(([id, { tool }]) => [id, catalog.reason(tool)]));
    const selected = selection.length > 0;
    const visible = new Set([
      ...(e.store.benchTabs.length > 1 && !e.world.active ? ["insert-bench"] : []),
      ...(reasons.get("convert-smart-object") === null ? ["convert-smart-object"] : []),
      ...(selected ? ["transform-smart-object", "detach-smart-object"] : []),
      ...(selection.length === 1 ? ["edit-smart-object", "open-smart-source"] : []),
      ...(focus.inline.length ? ["exit-smart-object"] : []),
    ]);
    this.root.hidden = !visible.size;
    this.context.hidden = !focus.inline.length;
    const name = e.store.benchTabs.find(({ id }) => id === e.store.editingBench)?.name;
    const label = focus.inline.length ? `Editing ${name ?? "source"} in place` : "";
    if (this.context.textContent !== label) this.context.textContent = label;
    for (const [id, { button }] of this.buttons) {
      button.hidden = !visible.has(id);
      button.disabled = reasons.get(id) !== null;
    }
  };

  dispose(): void {
    this.abort.abort();
    this.scene.dispose();
    toolCatalog(this.editor).linkedTool = undefined;
    this.editor.world.changed.delete(this.update);
    for (const dispose of this.disposers) dispose();
    this.root.remove();
  }
}
