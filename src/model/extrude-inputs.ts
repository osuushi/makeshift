import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { AxialDrag } from "./axial-drag.js";
import type { Extrusion } from "./body.js";
import { extrudeKeys } from "./extrude-keys.js";
import type { ExtrudeWidget } from "./extrude-widget.js";

/** Extrusion pointer, field and shortcut bindings share one interaction owner. */
export class ExtrudeInputs {
  private drag: AxialDrag;
  constructor(
    editor: SketchEditor,
    widget: ExtrudeWidget,
    actions: {
      begin: () => boolean;
      lease: () => InteractionLease | null;
      active: () => boolean;
      distance: () => number;
      symmetric: () => boolean;
      queue: (value: number, symmetric?: boolean) => void;
      mode: (mode: Extrusion["mode"]) => void;
      finish: () => void;
      cancel: () => void;
    },
    signal: AbortSignal,
  ) {
    const options = { signal };
    const focus = () => {
      widget.input.focus();
      widget.input.select();
    };
    this.drag = new AxialDrag(editor, widget.handle, signal, {
      begin: actions.begin,
      lease: actions.lease,
      axis: () => widget.axis,
      value: actions.distance,
      queue: actions.queue,
      symmetric: actions.symmetric,
      focus,
      modifySelection: true,
    });
    widget.handle.addEventListener(
      "click",
      (event) => {
        if (event.detail === 0 && actions.begin()) {
          editor.refresh();
          focus();
        }
      },
      options,
    );
    widget.input.addEventListener("focus", actions.begin, options);
    widget.draft.root.addEventListener("focusin", actions.begin, options);
    widget.input.addEventListener(
      "input",
      () => {
        if (actions.begin())
          actions.queue(widget.input.value.trim() ? Number(widget.input.value) : NaN);
      },
      options,
    );
    extrudeKeys(editor, widget.root, actions, signal);
  }
  reset(): void {
    this.drag.reset();
  }
}
