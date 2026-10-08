import type { SketchEditor } from "../sketch/editor.js";
import { modelingKey } from "../sketch/model-selection-state.js";
import { toolCatalog } from "../tools/catalog.js";
import type { TagControls } from "./controls.js";
import { type TaggedGroup, tagStatus } from "./model.js";

export class TagRows {
  private expanded = new Set<string>();
  private known = new Map<string, Set<string>>();
  constructor(
    private editor: SketchEditor,
    private controls: TagControls,
  ) {}
  wrap(row: HTMLElement, body: string, refresh: (() => void)[]): HTMLElement {
    const groups = this.editor.store.data.taggedGroups?.filter((g) => g.body === body) ?? [];
    if (groups.some((group) => !this.known.get(body)?.has(group.id))) this.expanded.add(body);
    this.known.set(body, new Set(groups.map((group) => group.id)));
    if (!groups.length) return row;
    const wrapper = document.createElement("div"),
      children = document.createElement("div"),
      toggle = document.createElement("button");
    children.className = "tag-children";
    children.hidden = !this.expanded.has(body);
    toggle.className = "tag-disclosure";
    toggle.setAttribute("aria-label", "Toggle tagged groups");
    toggle.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg>';
    const display = () => {
      toggle.setAttribute("aria-expanded", String(!children.hidden));
    };
    toggle.onclick = () => {
      children.hidden = !children.hidden;
      if (children.hidden) this.expanded.delete(body);
      else this.expanded.add(body);
      display();
    };
    display();
    row.prepend(toggle);
    for (const group of groups) children.append(this.groupRow(group, refresh));
    wrapper.append(row, children);
    return wrapper;
  }
  private groupRow(group: TaggedGroup, refresh: (() => void)[]): HTMLElement {
    const row = document.createElement("div");
    row.className = "tag-item";
    const button = document.createElement("button");
    button.className = "tag-row";
    button.textContent = group.name + (tagStatus(group) ? " ⚠" : "");
    button.title = [group.description, tagStatus(group)].filter(Boolean).join("\n");
    button.setAttribute("aria-label", `Select group ${group.name}`);
    button.onclick = (event) => void this.controls.select(group, event);
    button.onkeydown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.controls.begin(group);
      }
    };
    button.ondblclick = (event) => {
      if (!event.shiftKey && !event.ctrlKey && !event.metaKey) this.controls.begin(group);
    };
    const remove = document.createElement("button");
    remove.className = "tag-remove";
    remove.setAttribute("aria-label", `Remove group ${group.name}`);
    remove.title = "Remove group · keep geometry";
    remove.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h10M6 4V2h4v2M4 4l1 10h6l1-10M6.5 7v4M9.5 7v4"/></svg>';
    remove.onclick = () => {
      void toolCatalog(this.editor).activate({
        reason: () => null,
        run: () =>
          this.editor.store.request({
            kind: "tagged-group",
            edit: { action: "remove", id: group.id },
          }),
      });
    };
    refresh.push(() => {
      const selected = new Set(this.editor.modeling.targets.map(modelingKey));
      button.setAttribute(
        "aria-pressed",
        String(group.members.length > 0 && group.members.every((m) => selected.has(m.id))),
      );
      button.disabled = !!toolCatalog(this.editor).reason({ reason: () => null });
      remove.disabled = button.disabled;
    });
    row.append(button, remove);
    return row;
  }
}
