import type { SketchEditor } from "../sketch/editor.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";
import { isBuiltinDecorator, knurlDefinition } from "./builtins.js";
import { appendCustomContinue } from "./custom-continue.js";
import { appendCustomDecorators } from "./custom-panel.js";
import { resolveFaces } from "./cylinder.js";
import { editDecorators, faceKey, hasSettingsProblem } from "./edits.js";
import { appendKnurlSettings } from "./knurl-panel.js";
import { decoratorLibrary } from "./library.js";
import { appendThreadInformation } from "./panel-information.js";
import { appendDecoratorRepairs } from "./repair-panel.js";
import { DecoratorSettingsDraft } from "./settings-draft.js";
import { ThreadApplication } from "./thread-application.js";
import { appendThreadSettings } from "./thread-panel.js";
import { threadDefinition } from "./thread-settings.js";
import type { DecoratorEdit, DecoratorInstance, FaceReference, Settings } from "./types.js";
import "./panel.css";
import { gearFaces } from "./gear-faces.js";
import { gearDefinition } from "./gear-settings.js";

export class DecoratorPanel {
  private root = document.createElement("section");
  private unregister: () => void;
  private unregisterGear: () => void;
  private unregisterKnurl: () => void;
  private disposeLibrary: () => void;
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
    parent.append(this.root);
    this.disposeLibrary = decoratorLibrary(editor, parent);
    this.unregister = toolCatalog(editor).register({
      id: "threads",
      label: "Threads",
      category: "Solid",
      aliases: ["decorate", "screw", "thread"],
      description: "Editable threads on cylindrical faces; generated at mesh export",
      reason: () => idleReason(editor) ?? this.eligibility(),
      run: () => this.apply(),
    });
    this.unregisterGear = toolCatalog(editor).register({
      id: "gear",
      label: "Gear",
      category: "Solid",
      aliases: ["involute", "helical", "teeth"],
      description: "Involute teeth around selected pitch surfaces; generated at mesh export",
      reason: () => {
        const reason = idleReason(editor);
        if (reason) return reason;
        if (editor.world.active || this.selected().length !== editor.modeling.targets.length)
          return "Select pitch faces in Modeling";
        try {
          gearFaces(editor.store.data, this.selected());
          return null;
        } catch (error) {
          return error instanceof Error ? error.message : String(error);
        }
      },
      run: () => this.apply(gearDefinition),
    });
    this.unregisterKnurl = toolCatalog(editor).register({
      id: "knurling",
      label: "Knurling",
      category: "Solid",
      aliases: ["knurl", "grip", "diamond texture"],
      description: "Editable diamond knurling on cylindrical faces; generated at mesh export",
      reason: () => idleReason(editor) ?? this.eligibility(knurlDefinition),
      run: () => this.apply(knurlDefinition),
    });
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
    this.editor.modeling.targets = instances.flatMap((d) =>
      d.faces.map((f) => ({ kind: "face" as const, ...f })),
    );
    if (instances.length === 1) this.last = instances[0].id;
  }
  private async apply(definition = threadDefinition): Promise<void> {
    const faces = this.selected();
    const edit = { action: "apply" as const, definition, faces };
    if (definition === threadDefinition) {
      try {
        editDecorators(this.editor.store.data, edit);
      } catch {
        this.application.start(faces);
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
  private button(label: string, action: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.onclick = action;
    this.root.append(button);
    return button;
  }
  private patch(patch: Settings, preview: boolean, instances = this.instances()): void {
    this.expand(instances);
    const edit = { action: "settings" as const, ids: instances.map((d) => d.id), patch };
    if (preview) this.draft.preview(edit);
    else void this.edit(edit);
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
        d.problem &&
        !(d.definition === threadDefinition && hasSettingsProblem(this.editor.store.data, d)),
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
    for (const input of this.root.querySelectorAll<HTMLInputElement>("input, select, button"))
      input.disabled =
        input.dataset.unavailable === "true" ||
        this.editor.store.busy ||
        this.draft.waiting ||
        (!!this.editor.interactions.current && !this.draft.active);
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
    this.root.replaceChildren();
    const heading = document.createElement("h2");
    heading.textContent = "Decorators";
    this.root.append(heading);
    appendDecoratorRepairs(this.root, this.editor, problems);
    if (canContinue && last) {
      if (!isBuiltinDecorator(last.definition)) {
        appendCustomContinue(this.root, this.editor, last, this.selected());
        return;
      }
      this.button(
        last.definition === knurlDefinition
          ? "Continue knurling onto selection"
          : "Continue threads onto selection",
        () => {
          void this.edit({ action: "continue", id: last.id, faces: this.selected() });
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
    appendThreadInformation(this.root, this.editor, instances);
    const problem = instances.find((d) => d.problem)?.problem;
    if (problem) {
      const note = document.createElement("p");
      note.className = "decorator-warning";
      note.setAttribute("role", "status");
      note.textContent = `⚠ Threads need correction: ${problem}.`;
      if (instances.every((d) => !d.problem || hasSettingsProblem(this.editor.store.data, d)))
        note.textContent += " Adjust the settings below.";
      this.root.append(note);
    }
    if (instances.every((d) => !d.problem || hasSettingsProblem(this.editor.store.data, d))) {
      appendThreadSettings(
        this.root,
        instances,
        (patch, preview) => this.patch(patch, preview, instances),
        this.draft,
        this.advancedOpen || !!problem,
      );
    }
    this.button("Remove thread decorator from selected faces", () => {
      const keys = new Set(instances.flatMap((d) => d.faces.map(faceKey)));
      void this.edit({
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
    appendKnurlSettings(this.root, this.editor, instances, this.draft, (patch, preview) =>
      this.patch(patch, preview, instances),
    );
    this.button("Remove knurling decorator from selected faces", () => {
      const keys = new Set(instances.flatMap((d) => d.faces.map(faceKey)));
      void this.edit({
        action: "remove",
        faces: this.selected().filter((f) => keys.has(faceKey(f))),
      });
    });
  }
  dispose(): void {
    this.disposeLibrary();
    this.application.cancel();
    this.draft.cancel();
    this.unregister();
    this.unregisterGear();
    this.unregisterKnurl();
    this.editor.world.changed.delete(this.update);
    this.root.remove();
  }
}
