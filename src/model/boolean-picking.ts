import type { SketchEditor } from "../sketch/editor.js";
import type { Body, BodyBoolean } from "./body.js";
import { BodyPickProbe } from "./body-picking.js";
import { booleanRole } from "./boolean-selection.js";
import type { EntityViewer } from "./entity-viewer.js";

/** Viewport and Entities picks share the same accepted operands and role actions. */
export class BooleanPicking {
  constructor(
    private editor: SketchEditor,
    private entities: EntityViewer,
    signal: AbortSignal,
    private actions: {
      active: () => boolean;
      operation: () => BodyBoolean;
      toggle: (body: Body) => void;
      flip: (id: string) => void;
    },
  ) {
    editor.world.canvas.addEventListener(
      "click",
      (event) => {
        if (!actions.active() || event.button || event.metaKey || event.ctrlKey) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (editor.blocked) return;
        const hit = new BodyPickProbe(
          editor,
          { x: event.clientX, y: event.clientY },
          editor.store.data.bodies,
        ).faces()[0];
        const body = editor.store.data.bodies?.find((body) => body.id === hit?.body);
        if (body) actions.toggle(body);
      },
      { signal, capture: true },
    );
  }
  begin(): void {
    this.entities.sourcePicker = {
      choose: (target) => {
        const body = this.editor.store.data.bodies?.find(
          (body) => target.kind === "body" && body.id === target.body,
        );
        if (body) this.actions.toggle(body);
      },
      hover: () => {},
      selected: (target) =>
        target.kind === "body" && this.actions.operation().ids.includes(target.body),
      available: (target) => target.kind === "body" && this.editor.visibility.visible(target.body),
      role: (target) =>
        target.kind === "body" ? booleanRole(this.actions.operation(), target.body) : undefined,
      flipRole: (target) => {
        if (target.kind === "body") this.actions.flip(target.body);
      },
    };
  }
  end(): void {
    this.entities.sourcePicker = null;
  }
}
