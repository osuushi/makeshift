import type { SketchEditor } from "../sketch/editor.js";
import type { Body } from "./body.js";
import {
  completedLoopSelection,
  type EdgeLoopCompletion,
  edgeLoopCompletions,
} from "./edge-loop-completion.js";
import { fitWidgets, measuredControlRect, widgetViewport } from "./widget-viewport.js";
import "./edge-loop-controls.css";

/** Selection-only controls: cached geometry search, camera-dependent endpoint placement. */
export class EdgeLoopControls {
  private root = document.createElement("div");
  private bodies: readonly Body[] | undefined;
  private key = "";
  private buttons: { button: HTMLButtonElement; completion: EdgeLoopCompletion }[] = [];
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.root.className = "edge-loop-controls";
    overlay.append(this.root);
    editor.world.changed.add(this.update);
    this.update();
  }
  private available(): boolean {
    const editor = this.editor;
    return (
      !editor.world.active &&
      !editor.blocked &&
      !editor.interactions.current &&
      !editor.isDragging &&
      editor.bodiesVisible
    );
  }
  private rebuild(): void {
    const editor = this.editor;
    this.root.replaceChildren();
    this.buttons = [];
    for (const body of this.bodies ?? []) {
      const selected = new Set(
        editor.modeling.targets.flatMap((t) =>
          t.kind === "edge" && t.body === body.id ? [t.edge] : [],
        ),
      );
      if (!selected.size) continue;
      for (const completion of edgeLoopCompletions(body, selected)) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "edge-loop-button";
        button.title = "Close loop";
        button.setAttribute("aria-label", "Close loop");
        button.innerHTML =
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6M13 2l3 3-3 3"/><path d="M19 8V5" stroke-dasharray="1 3"/></svg>';
        button.addEventListener("pointerdown", (event) => event.stopPropagation());
        button.onclick = (event) => {
          event.stopPropagation();
          if (!this.available()) return;
          editor.modeling.targets = completedLoopSelection(editor.modeling.targets, completion);
          for (const notify of editor.modeling.selectionChosen) notify();
          editor.refresh();
        };
        this.root.append(button);
        this.buttons.push({ button, completion });
      }
    }
  }
  private update = (): void => {
    this.root.hidden = !this.available();
    if (this.root.hidden) return;
    const editor = this.editor;
    const key = JSON.stringify(
      editor.modeling.targets.filter((t) => t.kind === "edge").map((t) => [t.body, t.edge]),
    );
    if (this.bodies !== editor.store.data.bodies || this.key !== key) {
      this.bodies = editor.store.data.bodies;
      this.key = key;
      this.rebuild();
    }
    const rect = this.root.getBoundingClientRect();
    const { viewport, obstacles } = widgetViewport(this.root);
    for (const element of document.querySelectorAll<HTMLElement>(
      ".edge-finish-panel, .edge-size-handle",
    ))
      if (element.getClientRects().length) obstacles.push(measuredControlRect(element));
    for (const { button, completion } of this.buttons) {
      button.hidden = !editor.visibility.visible(completion.body);
      if (button.hidden) continue;
      const candidates = completion.ends.map((end, i) => {
        const point = editor.world.project(end),
          neighbor = editor.world.project(completion.neighbors[i]);
        const dx = point.x - neighbor.x,
          dy = point.y - neighbor.y;
        const length = Math.hypot(dx, dy);
        return {
          x: point.x + (length > 1 ? dx / length : 1) * 28,
          y: point.y + (length > 1 ? dy / length : 0) * 28,
          width: 30,
          height: 30,
        };
      });
      const fits = candidates.map((candidate) => {
        const point = fitWidgets([candidate], obstacles, viewport)[0];
        return { point, distance: Math.hypot(point.x - candidate.x, point.y - candidate.y) };
      });
      const { point } = fits.sort((a, b) => a.distance - b.distance)[0];
      button.style.left = `${point.x - rect.left}px`;
      button.style.top = `${point.y - rect.top}px`;
      obstacles.push(point);
    }
  };
  dispose(): void {
    this.editor.world.changed.delete(this.update);
    this.root.remove();
  }
}
