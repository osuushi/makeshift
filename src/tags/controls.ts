import { cancelModelSelectionDrag } from "../model/model-selection-drag.js";
import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import { type ModelingTarget, modelingKey } from "../sketch/model-selection-state.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";
import { type TaggedGroup, tagStatus } from "./model.js";
import { tagMembers, tagSelectionBody, tagTargets } from "./selection.js";
import "./style.css";

export class TagControls {
  private panel = document.createElement("section");
  private name = document.createElement("input");
  private description = document.createElement("textarea");
  private count = document.createElement("p");
  private problem = document.createElement("p");
  private lease: InteractionLease | null = null;
  private original: ModelingTarget[] = [];
  private group: TaggedGroup | null = null;
  private body: string | null = null;
  private abort = new AbortController();
  private unregister: () => void;
  constructor(
    private editor: SketchEditor,
    app: HTMLElement,
  ) {
    this.panel.className = "tag-editor";
    this.panel.hidden = true;
    this.panel.setAttribute("aria-label", "Edit tagged group");
    const title = document.createElement("h2");
    title.textContent = "Tagged group";
    this.name.setAttribute("aria-label", "Group name");
    this.name.maxLength = 200;
    this.description.setAttribute("aria-label", "Group description");
    this.description.placeholder = "What this geometry is for (optional)";
    this.description.maxLength = 2000;
    const help = document.createElement("p");
    help.textContent =
      "Select faces and edges in this body. Shift adds · ⌘/Ctrl toggles · drag a box · hold for overlaps.";
    const done = document.createElement("button"),
      cancel = document.createElement("button"),
      remove = document.createElement("button");
    done.textContent = "Done";
    cancel.textContent = "Cancel";
    remove.textContent = "Remove group";
    done.onclick = () => void this.finish();
    cancel.onclick = () => this.cancel();
    remove.onclick = () => void this.remove();
    remove.dataset.action = "remove-tag";
    this.panel.append(
      title,
      this.name,
      this.description,
      help,
      this.count,
      this.problem,
      done,
      cancel,
      remove,
    );
    app.append(this.panel);
    this.unregister = toolCatalog(editor).register({
      id: "tag-geometry",
      finishEdit: true,
      label: "Tag geometry",
      category: "Reference",
      aliases: ["group", "named selection"],
      reason: () =>
        idleReason(editor) ??
        (editor.world.active || !tagSelectionBody(editor.modeling.targets)
          ? "Select faces or edges in one body"
          : null),
      run: () => this.begin(),
    });
    onModelKeydown(
      (event) => {
        if (!this.lease || document.querySelector(".selection-overlap:not([hidden])")) return;
        if (event.key === "Enter" && event.target instanceof HTMLButtonElement) return;
        if (
          event.key === "Escape" ||
          (event.key === "Enter" && event.target !== this.description)
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (event.key === "Escape") this.cancel();
          else void this.finish();
        }
      },
      { capture: true, signal: this.abort.signal },
    );
    editor.world.changed.add(this.update);
  }
  begin(group?: TaggedGroup): void {
    if (this.editor.interactions.current && this.editor.interactions.current !== this.lease) {
      void toolCatalog(this.editor).activate({ reason: () => null, run: () => this.begin(group) });
      return;
    }
    const e = this.editor;
    if (e.blocked || e.interactions.current || e.world.active) return;
    if (group) {
      group = e.store.data.taggedGroups?.find((item) => item.id === group?.id);
      if (!group) return;
    }
    const body = group?.body ?? tagSelectionBody(e.modeling.targets);
    if (!body) return;
    const lease = e.interactions.acquire(
      "tag-membership",
      () => this.cancel(),
      async () => {
        await this.finish();
        return !this.lease;
      },
      {
        navigation: "when-released",
      },
    );
    if (!lease) return;
    this.lease = lease;
    this.original = [...e.modeling.targets];
    this.group = group ?? null;
    this.body = body;
    e.modeling.memberBody = body;
    if (group) e.modeling.targets = tagTargets(group);
    this.name.value = group?.name ?? "New group";
    this.description.value = group?.description ?? "";
    this.problem.textContent = group ? tagStatus(group) : "";
    this.panel.hidden = false;
    const remove = this.panel.querySelector<HTMLButtonElement>('[data-action="remove-tag"]');
    if (remove) remove.hidden = !group;
    e.modeling.hover = null;
    e.modeling.alternatives = [];
    e.refresh();
    this.name.focus();
    this.name.select();
  }
  async select(group: TaggedGroup, event: MouseEvent): Promise<void> {
    const e = this.editor;
    await toolCatalog(e).activate({
      reason: () => null,
      run: () => this.selectAccepted(group, event),
    });
  }
  private selectAccepted(group: TaggedGroup, event: MouseEvent): void {
    const e = this.editor;
    const accepted = e.store.data.taggedGroups?.find((item) => item.id === group.id);
    if (!accepted) return;
    group = accepted;
    e.world.exit();
    const targets = tagTargets(group),
      toggle = event.metaKey || event.ctrlKey;
    if (!event.shiftKey && !toggle) e.modeling.targets = targets;
    else {
      const keys = new Set(e.modeling.targets.map(modelingKey));
      const remove = toggle && targets.every((t) => keys.has(modelingKey(t)));
      if (remove) {
        const members = new Set(targets.map(modelingKey));
        e.modeling.targets = e.modeling.targets.filter((t) => !members.has(modelingKey(t)));
      } else for (const target of targets) e.modeling.choose(target, true, false);
    }
    e.modeling.hover = null;
    e.modeling.alternatives = [];
    e.refresh();
  }
  private update = (): void => {
    if (!this.lease) return;
    const members = tagMembers(this.editor.modeling.targets);
    this.count.textContent = `${members.filter((m) => m.kind === "face").length} faces · ${members.filter((m) => m.kind === "edge").length} edges`;
    for (const button of this.panel.querySelectorAll("button"))
      button.disabled = this.editor.blocked;
  };
  private async finish(): Promise<void> {
    if (!this.lease || this.editor.blocked || !this.body || this.lease.captured) return;
    const members = tagMembers(this.editor.modeling.targets);
    const edit = this.group
      ? {
          action: "update" as const,
          id: this.group.id,
          name: this.name.value.trim(),
          description: this.description.value,
          members,
        }
      : {
          action: "create" as const,
          body: this.body,
          name: this.name.value.trim(),
          description: this.description.value,
          members,
        };
    if (await this.editor.store.request({ kind: "tagged-group", edit })) this.close(false);
    else this.problem.textContent = this.editor.message;
  }
  private async remove(): Promise<void> {
    if (!this.group || this.editor.blocked) return;
    if (
      await this.editor.store.request({
        kind: "tagged-group",
        edit: { action: "remove", id: this.group.id },
      })
    )
      this.close(false);
  }
  private cancel(): void {
    if (!this.editor.blocked) this.close(true);
  }
  private close(restore: boolean): void {
    if (!this.lease) return;
    cancelModelSelectionDrag(this.editor);
    this.editor.modeling.memberBody = null;
    if (restore) this.editor.modeling.targets = this.original;
    this.panel.hidden = true;
    const lease = this.lease;
    this.lease = null;
    lease.release();
    this.editor.world.canvas.focus();
    this.editor.refresh();
  }
  dispose(): void {
    this.close(true);
    this.abort.abort();
    this.unregister();
    this.editor.world.changed.delete(this.update);
    this.panel.remove();
  }
}
