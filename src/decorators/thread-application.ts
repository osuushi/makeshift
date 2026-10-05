import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchDocument } from "../sketch/document.js";
import type { SketchEditor } from "../sketch/editor.js";
import { editDecorators, prepareBuiltinApplication } from "./edits.js";
import { appendThreadInformation } from "./panel-information.js";
import { appendThreadSettings } from "./thread-panel.js";
import { threadDefinition } from "./thread-settings.js";
import type { DecoratorInstance, FaceReference, Settings } from "./types.js";

interface Application {
  lease: InteractionLease;
  original: SketchDocument;
  faces: FaceReference[];
  settings: Settings;
  instances: DecoratorInstance[];
  error: string;
  parsed: boolean;
}

/** Correction settings remain local until ordinary validated application succeeds. */
export class ThreadApplication {
  private current: Application | null = null;
  private status = document.createElement("p");
  private accept = document.createElement("button");
  constructor(
    private editor: SketchEditor,
    private root: HTMLElement,
    private ended: () => void,
  ) {}
  get active(): boolean {
    return this.current !== null;
  }
  start(faces: FaceReference[]): void {
    const original = this.editor.store.data;
    try {
      const instances = this.propose(original, faces, {});
      const lease = this.editor.interactions.acquire(
        "numeric",
        () => this.cancel(),
        () => this.commit(),
        { navigation: "when-released" },
      );
      if (!lease) return;
      this.current = { lease, original, faces, settings: {}, instances, error: "", parsed: true };
      this.compute();
      this.render();
      lease.trackHistory(
        this.root,
        () => this.current?.settings ?? {},
        (settings) => {
          if (!this.current) return;
          this.current.settings = settings;
          this.compute();
          this.render();
          this.editor.refresh();
        },
      );
    } catch (error) {
      this.editor.message = error instanceof Error ? error.message : String(error);
    }
    this.editor.refresh();
  }
  private propose(original: SketchDocument, faces: FaceReference[], settings: Settings) {
    return prepareBuiltinApplication(original, {
      action: "apply",
      definition: threadDefinition,
      faces,
      settings,
    }).filter((d) => !(original.decorators ?? []).includes(d));
  }
  private patch = (patch: Settings, preview: boolean): void => {
    const current = this.current;
    if (current?.lease.phase !== "editing") return;
    const settings = { ...current.settings };
    if (patch.preset && patch.preset !== "custom") {
      for (const key of ["pitch", "profile", "clearance", "tipTruncation"]) delete settings[key];
    }
    current.settings = { ...settings, ...patch };
    this.compute();
    if (!preview) this.render();
    this.editor.refresh();
  };
  private compute(): void {
    const current = this.current;
    if (!current) return;
    current.lease.show(null);
    current.parsed = false;
    try {
      const proposed = this.propose(current.original, current.faces, current.settings);
      current.parsed = true;
      current.instances = proposed.map((instance, index) => ({
        ...instance,
        id: current.instances[index]?.id ?? instance.id,
      }));
      const candidate = editDecorators(current.original, {
        action: "apply",
        definition: threadDefinition,
        faces: current.faces,
        settings: current.settings,
      });
      current.lease.show({
        ...candidate,
        decorators: [...(current.original.decorators ?? []), ...current.instances],
      });
      current.error = "";
    } catch (error) {
      current.error = error instanceof Error ? error.message : String(error);
    }
    this.editor.message = current.error;
    this.update();
  }
  private render(): void {
    const current = this.current;
    if (!current) return;
    this.root.replaceChildren();
    const heading = document.createElement("h2");
    heading.textContent = "Create threads";
    this.status = document.createElement("p");
    this.status.setAttribute("role", "status");
    this.status.className = "decorator-warning";
    this.root.append(heading, this.status);
    const explanation = document.createElement("p");
    explanation.textContent =
      "The default settings do not fit this cylinder. Adjust them below, then create the threads. Nothing is added until you confirm.";
    this.root.append(explanation);
    appendThreadInformation(this.root, this.editor, current.instances);
    const fields = current.parsed
      ? current.instances
      : current.instances.map((instance) => ({
          ...instance,
          settings: { ...instance.settings, ...current.settings },
        }));
    appendThreadSettings(this.root, fields, this.patch, this, true);
    this.accept = document.createElement("button");
    this.accept.type = "button";
    this.accept.textContent = "Create threads";
    this.accept.onclick = () => void this.commit();
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.onclick = () => this.cancel();
    this.root.append(this.accept, cancel);
    this.update();
  }
  update(): void {
    const current = this.current;
    if (!current) return;
    const waiting = current.lease.phase !== "editing" || this.editor.store.busy;
    this.status.textContent = waiting
      ? "Creating threads…"
      : current.error || "Preview only. Create threads to keep these settings.";
    for (const control of this.root.querySelectorAll<HTMLInputElement>("input, select, button"))
      control.disabled = waiting;
    this.accept.disabled = waiting || !!current.error;
  }
  async blur(): Promise<void> {
    // Moving between fields keeps the full correction provisional.
  }
  async commit(): Promise<boolean> {
    const current = this.current;
    if (!current) return true;
    if (current.error || !current.lease.wait()) return false;
    this.editor.refresh();
    const accepted = await this.editor.store.request({
      kind: "decorator",
      edit: {
        action: "apply",
        definition: threadDefinition,
        faces: current.faces,
        settings: current.settings,
      },
    });
    if (this.current !== current) return accepted;
    if (accepted) this.end();
    else {
      current.error = this.editor.message;
      current.lease.resume();
      this.editor.refresh();
    }
    return accepted;
  }
  cancel(): void {
    if (this.current?.lease.phase !== "editing") return;
    this.end();
  }
  private end(): void {
    const current = this.current;
    if (!current) return;
    this.current = null;
    this.editor.message = "";
    this.ended();
    current.lease.release();
    this.editor.refresh();
  }
}
