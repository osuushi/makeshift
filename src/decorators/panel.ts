import type { SketchEditor } from "../sketch/editor.js";
import { toolCatalog } from "../tools/catalog.js";
import { isBuiltinDecorator, knurlDefinition } from "./builtins.js";
import { appendCustomContinue } from "./custom-continue.js";
import { appendCustomDecorators } from "./custom-panel.js";
import { resolveFaces } from "./cylinder.js";
import { editDecorators, faceKey } from "./edits.js";
import { appendKnurlSettings } from "./knurl-panel.js";
import { decoratorLibrary } from "./library.js";
import { appendThreadInformation, appendThreadProblem } from "./panel-information.js";
import { appendPresetControls } from "./preset-panel.js";
import { choiceKey } from "./presets.js";
import { appendDecoratorRepairs } from "./repair-panel.js";
import { DecoratorSettingsDraft } from "./settings-draft.js";
import { ThreadApplication } from "./thread-application.js";
import { appendThreadSettings } from "./thread-panel.js";
import { threadDefinition } from "./thread-settings.js";
import type { DecoratorEdit, DecoratorInstance, FaceReference, Settings } from "./types.js";
import "./panel.css";
import { gearFitFailure } from "./gear-group-geometry.js";
import { gearGroupPanel } from "./gear-group-panel.js";
import { registerDecoratorTools } from "./tool-registration.js";

export class DecoratorPanel {
  private surface = document.createElement("div");
  private root = document.createElement("section");
  private unregister: () => void;
  private disposeLibrary: () => void;
  private disposeGearGroups: () => void;
  private key = "";
  private shownDocument: SketchEditor["store"]["data"] | null = null;
  private last: string | null = null;
  private advancedOpen = false;
  private draft: DecoratorSettingsDraft;
  private application: ThreadApplication;
  constructor(
    private editor: SketchEditor,
    parent: HTMLElement,
  ) {
    this.draft = new DecoratorSettingsDraft(editor, () => {
      this.key = "";
    });
    this.application = new ThreadApplication(editor, this.root, () => {
      this.key = "";
    });
    this.root.className = "decorator-panel";
    this.root.setAttribute("aria-label", "Decorators");
    this.surface.className = "decorator-stack";
    this.surface.append(this.root);
    parent.append(this.surface);
    this.disposeLibrary = decoratorLibrary(editor, parent);
    this.disposeGearGroups = gearGroupPanel(editor, this.surface);
    this.unregister = registerDecoratorTools(
      editor,
      (definition) => this.apply(definition),
      (definition) => this.eligibility(definition),
    );
    editor.world.changed.add(this.update);
    this.update();
  }
  private selected(): FaceReference[] {
    return this.editor.modeling.targets.flatMap((t) =>
      t.kind === "face" ? [{ body: t.body, face: t.face }] : [],
    );
  }
  private instances(): DecoratorInstance[] {
    const keys = new Set(this.selected().map(faceKey));
    return (this.editor.store.data.decorators ?? []).filter((d) =>
      d.faces.some((f) => keys.has(faceKey(f))),
    );
  }
  private eligibility(definition = threadDefinition): string | null {
    if (this.editor.world.active) return "Return to Modeling and select cylindrical faces";
    const faces = this.selected();
    if (!faces.length || faces.length !== this.editor.modeling.targets.length)
      return "Select cylindrical faces";
    try {
      resolveFaces(this.editor.store.data.bodies ?? [], faces);
      if (this.instances().some((d) => !d.problem && d.definition !== definition))
        return "Remove the existing decorator before applying another";
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }
  private expand(instances = this.instances()): void {
    instances = this.fresh(instances);
    this.editor.modeling.targets = instances.flatMap((d) =>
      d.faces.map((f) => ({ kind: "face" as const, ...f })),
    );
    if (instances.length === 1) this.last = instances[0].id;
  }
  private async apply(definition = threadDefinition): Promise<void> {
    const faces = this.selected();
    const settings = this.editor.store.data.lastDecoratorChoices?.[choiceKey(definition)]?.settings;
    const edit = { action: "apply" as const, definition, faces };
    if (definition === threadDefinition) {
      try {
        editDecorators(this.editor.store.data, { ...edit, settings });
      } catch {
        this.application.start(faces, settings);
        return;
      }
    }
    if (await this.edit(edit)) {
      this.expand();
      this.editor.refresh();
    }
  }
  private async edit(edit: DecoratorEdit): Promise<boolean> {
    return this.editor.store.request({ kind: "decorator", edit });
  }
  private button(label: string, action: () => unknown): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.onclick = () =>
      void toolCatalog(this.editor).activate({
        finishEdit: true,
        reason: () => null,
        run: action,
      });
    this.root.append(button);
    return button;
  }
  private fresh(instances: DecoratorInstance[]): DecoratorInstance[] {
    const ids = new Set(instances.map((instance) => instance.id));
    return (this.editor.store.data.decorators ?? []).filter((instance) => ids.has(instance.id));
  }
  private patch(patch: Settings, preview: boolean, instances = this.instances()) {
    const run = () => {
      const current = this.fresh(instances);
      this.expand(current);
      const edit = { action: "settings" as const, ids: current.map((d) => d.id), patch };
      if (preview) this.draft.preview(edit);
      else return this.edit(edit);
    };
    if (preview && this.draft.active) run();
    else return toolCatalog(this.editor).activate({ finishEdit: true, reason: () => null, run });
  }
  private updateDraftControls(instances: DecoratorInstance[]): HTMLParagraphElement {
    for (const input of this.root.querySelectorAll<HTMLInputElement>("input, select, button"))
      input.disabled =
        input.dataset.unavailable === "true" ||
        (this.editor.store.busy && (!this.editor.interactions.current || this.draft.active)) ||
        this.draft.waiting ||
        toolCatalog(this.editor).switching ||
        !!this.editor.interactions.current?.captured;
    let feedback = this.root.querySelector<HTMLParagraphElement>(".decorator-draft-feedback");
    if (!feedback) {
      feedback = document.createElement("p");
      feedback.className = "decorator-warning decorator-draft-feedback";
      feedback.setAttribute("role", "status");
      this.root.append(feedback);
    }
    feedback.textContent = this.draft.active
      ? this.draft.feedback
      : (instances.find((d) => d.problem?.startsWith(gearFitFailure))?.problem ?? "");
    feedback.hidden = !feedback.textContent;
    return feedback;
  }
  private update = (): void => {
    if (this.application.active) {
      this.root.hidden = false;
      this.application.update();
      return;
    }
    const instances = this.instances();
    const problems = (this.editor.store.data.decorators ?? []).filter(
      (d) =>
        d.problem && !d.problem.startsWith(gearFitFailure) && d.definition !== threadDefinition,
    );
    const last = this.editor.store.data.decorators?.find((d) => d.id === this.last);
    const canContinue =
      !!last &&
      !last.problem &&
      !instances.length &&
      (isBuiltinDecorator(last.definition)
        ? !this.eligibility()
        : this.selected().length > 0 &&
          this.selected().length === this.editor.modeling.targets.length);
    this.root.hidden =
      this.editor.interactions.current?.kind === "tag-membership" ||
      !!this.editor.world.active ||
      (!instances.length && !canContinue && !problems.length);
    const feedback = this.updateDraftControls(instances);
    if (this.draft.active) return;
    const key = JSON.stringify([
      instances,
      problems,
      canContinue,
      this.selected(),
      this.editor.store.decoratorSources,
    ]);
    if (key === this.key && this.shownDocument === this.editor.store.data) return;
    this.key = key;
    this.shownDocument = this.editor.store.data;
    const advanced = this.root.querySelector<HTMLDetailsElement>("details.thread-advanced");
    if (advanced) this.advancedOpen = advanced.open;
    this.root.replaceChildren(feedback);
    const heading = document.createElement("h2");
    heading.textContent = "Decorators";
    this.root.append(heading);
    appendDecoratorRepairs(this.root, this.editor, problems);
    if (canContinue && last) {
      if (!isBuiltinDecorator(last.definition)) {
        appendCustomContinue(this.root, this.editor, last);
        return;
      }
      this.button(
        last.definition === knurlDefinition
          ? "Continue knurling onto selection"
          : "Continue threads onto selection",
        () => {
          return this.edit({ action: "continue", id: last.id, faces: this.selected() });
        },
      );
      return;
    }
    if (!instances.length) return;
    if (instances.length === 1) this.last = instances[0].id;
    const custom = instances.filter((d) => !isBuiltinDecorator(d.definition));
    if (custom.length) {
      appendCustomDecorators(this.root, this.editor, custom, this.draft, (group, patch, preview) =>
        this.patch(patch, preview, group),
      );
    }
    const knurls = instances.filter((d) => d.definition === knurlDefinition);
    if (knurls.length) this.appendKnurls(knurls);
    const threads = instances.filter((d) => d.definition === threadDefinition);
    if (threads.length) this.appendThreads(threads);
  };
  private appendThreads(instances: DecoratorInstance[]): void {
    this.button(`Threads · ${instances.reduce((n, d) => n + d.faces.length, 0)} faces`, () => {
      this.expand(instances);
      this.editor.refresh();
    });
    appendPresetControls(this.root, this.editor, instances);
    appendThreadInformation(this.root, this.editor, instances);
    const problem = appendThreadProblem(this.root, instances);
    appendThreadSettings(
      this.root,
      instances,
      (patch, preview) => this.patch(patch, preview, instances),
      this.draft,
      this.advancedOpen || !!problem,
      false,
    );
    this.button("Remove thread decorator from selected faces", () => {
      const keys = new Set(this.fresh(instances).flatMap((d) => d.faces.map(faceKey)));
      return this.edit({
        action: "remove",
        faces: this.selected().filter((f) => keys.has(faceKey(f))),
      });
    });
  }
  private appendKnurls(instances: DecoratorInstance[]): void {
    this.button(`Knurling · ${instances.reduce((n, d) => n + d.faces.length, 0)} faces`, () => {
      this.expand(instances);
      this.editor.refresh();
    });
    appendPresetControls(this.root, this.editor, instances);
    appendKnurlSettings(this.root, this.editor, instances, this.draft, (patch, preview) =>
      this.patch(patch, preview, instances),
    );
    this.button("Remove knurling decorator from selected faces", () => {
      const keys = new Set(this.fresh(instances).flatMap((d) => d.faces.map(faceKey)));
      return this.edit({
        action: "remove",
        faces: this.selected().filter((f) => keys.has(faceKey(f))),
      });
    });
  }
  dispose(): void {
    this.editor.world.changed.delete(this.update);
    this.disposeLibrary();
    this.disposeGearGroups();
    this.application.cancel();
    this.draft.cancel();
    this.unregister();
    this.surface.remove();
  }
}
