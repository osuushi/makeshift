import type { SketchEditor } from "../sketch/editor.js";
import type { Point } from "../sketch/planes.js";
import type { Body, BodyBoolean } from "./body.js";
import { booleanRoleIcon } from "./boolean-role-icon.js";
import { placeBooleanRole, roleBounds } from "./boolean-role-placement.js";
import { booleanRole } from "./boolean-selection.js";
import { entityRows } from "./entity-presentation.js";
import "./boolean-role-widgets.css";

/** Operand roles stay attached to the original bodies, even when the preview cuts them away. */
export class BooleanRoleWidgets {
  private root = document.createElement("div");
  private buttons = new Map<string, HTMLButtonElement>();
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
    private flip: (id: string) => void,
  ) {
    this.root.className = "boolean-role-widgets";
    overlay.append(this.root);
  }
  update(operation: BodyBoolean, bodies: readonly Body[]): void {
    if (operation.mode !== "subtract") {
      this.clear();
      return;
    }
    const visible = bodies.filter((body) => this.editor.visibility.visible(body.id));
    for (const [id, button] of this.buttons) {
      if (visible.some((body) => body.id === id)) continue;
      button.remove();
      this.buttons.delete(id);
    }
    const data = this.editor.store.data;
    const names = entityRows(
      data,
      (data.bodies ?? []).map((body) => body.id),
      "Body",
    );
    const placed: Point[] = [];
    const viewport = this.root.getBoundingClientRect();
    const bounds = visible.map((body) =>
      roleBounds(body, (position) => {
        const point = this.editor.world.project(position);
        return { x: point.x - viewport.left, y: point.y - viewport.top };
      }),
    );
    for (const body of visible) {
      let button = this.buttons.get(body.id);
      if (!button) {
        button = document.createElement("button");
        button.className = "boolean-role-widget";
        button.dataset.body = body.id;
        button.onclick = (event) => {
          event.stopPropagation();
          this.flip(body.id);
        };
        this.buttons.set(body.id, button);
        this.root.append(button);
      }
      const target = booleanRole(operation, body.id) === "target";
      const name = names.find((entry) => entry.id === body.id)?.name ?? "Body";
      button.innerHTML = booleanRoleIcon(target);
      button.dataset.role = target ? "target" : "tool";
      button.setAttribute("aria-label", `Change subtraction role of ${name} in viewport`);
      button.setAttribute("aria-pressed", String(target));
      button.title = `${name} · ${target ? "Target (+) — change to cutting tool (−)" : "Cutting tool (−) — change to target (+)"}`;
      button.disabled = this.editor.blocked;
      const index = visible.indexOf(body);
      const point = placeBooleanRole(
        bounds[index],
        bounds.filter((_, other) => other !== index),
        placed,
        viewport,
      );
      placed.push(point);
      button.style.left = `${point.x}px`;
      button.style.top = `${point.y}px`;
    }
  }
  clear(): void {
    for (const button of this.buttons.values()) button.remove();
    this.buttons.clear();
  }
  dispose(): void {
    this.clear();
    this.root.remove();
  }
}
