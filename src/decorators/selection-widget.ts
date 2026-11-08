import { selectionAnchor } from "../model/selection-anchor.js";
import { WidgetClearance } from "../model/widget-clearance.js";
import { measuredControlRect } from "../model/widget-viewport.js";
import type { SketchEditor } from "../sketch/editor.js";
import { toolCatalog } from "../tools/catalog.js";
import { selectedDecoratorFaces } from "./selection.js";
import "./selection-widget.css";

/** A selection shortcut; accepted attachments and removal remain document-owner edits. */
export class DecoratorSelectionWidget {
  private root = document.createElement("div");
  private controls = document.createElement("div");
  private placement = new WidgetClearance(this.root);
  private open: HTMLButtonElement;
  private remove: HTMLButtonElement;
  constructor(
    private editor: SketchEditor,
    private overlay: HTMLElement,
    reveal: () => void,
  ) {
    this.root.className = "decorator-selection-widget";
    this.controls.className = "decorator-selection-actions";
    this.controls.setAttribute("role", "group");
    this.controls.setAttribute("aria-label", "Selected decorators");
    this.open = this.button(
      "Show decorators in Inspector",
      '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
      () => {
        editor.modeling.targets = this.faces().map((face) => ({ kind: "face", ...face }));
        editor.refresh();
        reveal();
      },
    );
    this.remove = this.button(
      "Remove decorators from selection",
      '<path d="m6 6 12 12M18 6 6 18"/>',
      () =>
        editor.store.request({
          kind: "decorator",
          edit: { action: "remove", faces: this.faces() },
        }),
    );
    this.remove.className = "decorator-selection-remove";
    this.root.append(this.controls);
    overlay.append(this.root);
    editor.world.changed.add(this.update);
    this.update();
  }
  private faces() {
    return selectedDecoratorFaces(
      this.editor.store.data.decorators ?? [],
      this.editor.modeling.targets,
    );
  }
  private button(label: string, paths: string, run: () => unknown): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
    button.onclick = () =>
      void toolCatalog(this.editor).activate({ finishEdit: true, reason: () => null, run });
    this.controls.append(button);
    return button;
  }
  private update = (): void => {
    const editor = this.editor;
    this.root.hidden =
      !!editor.world.active ||
      !editor.bodiesVisible ||
      !this.faces().length ||
      !!editor.interactions.current ||
      editor.isDragging;
    if (this.root.hidden) return;
    this.open.disabled = this.remove.disabled = editor.blocked || toolCatalog(editor).switching;
    const point = editor.world.project(selectionAnchor(editor));
    const bounds = this.overlay.getBoundingClientRect();
    this.controls.style.left = `${point.x - bounds.left + 52}px`;
    this.controls.style.top = `${point.y - bounds.top - 52}px`;
    const reserved = [...this.overlay.querySelectorAll<HTMLElement>("button, input, select")]
      .filter((element) => !this.root.contains(element) && element.getClientRects().length)
      .map(measuredControlRect);
    this.placement.fit([this.controls], undefined, reserved);
  };
  dispose(): void {
    this.editor.world.changed.delete(this.update);
    this.placement.dispose();
    this.root.remove();
  }
}
