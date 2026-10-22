import { visibilityIcon } from "../model/visibility-icon.js";
import type { SketchEditor } from "../sketch/editor.js";
import { toolCatalog } from "../tools/catalog.js";
import type { GuideControls } from "./controls.js";
import { type GuidePoint, guideMeaning, guideOwner } from "./types.js";

export class GuideRows {
  constructor(
    private editor: SketchEditor,
    private controls: GuideControls,
  ) {}
  rows(owner: string, refresh: (() => void)[]): HTMLElement[] {
    return (this.editor.store.data.guidePoints ?? [])
      .filter((g) => guideOwner(g.anchor) === owner)
      .map((g) => this.row(g, refresh));
  }
  private row(guide: GuidePoint, refresh: (() => void)[]): HTMLElement {
    const row = document.createElement("div"),
      line = document.createElement("div"),
      label = document.createElement("button");
    row.dataset.childId = guide.id;
    line.className = "tag-item guide-item";
    label.className = "tag-row";
    label.textContent = guide.name;
    label.setAttribute("aria-label", `Select ${guide.name}`);
    label.title = `${guide.name} · ${guideMeaning(guide.anchor)}`;
    label.onclick = () => this.controls.select(guide);
    line.onpointerenter = () => this.controls.hover(guide.anchor);
    line.onpointerleave = () => this.controls.hover(null);
    label.ondblclick = () => this.rename(guide, label);
    const eye = document.createElement("button");
    eye.className = "tag-remove";
    eye.innerHTML = visibilityIcon(!guide.hidden);
    eye.setAttribute("aria-label", `${guide.hidden ? "Show" : "Hide"} ${guide.name}`);
    eye.title = `${guide.hidden ? "Show" : "Hide"} ${guide.name}`;
    eye.onclick = () =>
      void toolCatalog(this.editor).activate({
        reason: () => null,
        run: () =>
          this.editor.store.request({
            kind: "guide-point",
            edit: { action: "update", id: guide.id, hidden: !guide.hidden },
          }),
      });
    refresh.push(() => {
      label.setAttribute("aria-pressed", String(this.controls.selected === guide.id));
      row.classList.toggle("entity-hidden", guide.hidden);
      for (const button of [label, eye])
        button.disabled = !!toolCatalog(this.editor).reason({ reason: () => null });
    });
    line.append(label, eye);
    row.append(line);
    return row;
  }
  private rename(guide: GuidePoint, label: HTMLButtonElement): void {
    void toolCatalog(this.editor).activate({
      reason: () => null,
      run: () => {
        const input = document.createElement("input");
        input.className = "guide-name";
        input.value = guide.name;
        input.maxLength = 200;
        input.setAttribute("aria-label", "Guide point name");
        label.replaceWith(input);
        input.focus();
        input.select();
        let finished = false;
        const finish = (cancel: boolean) => {
          if (finished) return;
          finished = true;
          input.replaceWith(label);
          if (!cancel && input.value.trim() && input.value.trim() !== guide.name)
            void this.editor.store.request({
              kind: "guide-point",
              edit: { action: "update", id: guide.id, name: input.value.trim() },
            });
        };
        input.onblur = () => finish(false);
        input.onkeydown = (event) => {
          if (event.key === "Enter" || event.key === "Escape") {
            event.stopPropagation();
            event.preventDefault();
            finish(event.key === "Escape");
          }
        };
      },
    });
  }
}
