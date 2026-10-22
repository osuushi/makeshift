import type { SketchEditor } from "../sketch/editor.js";
import { type ExtrudeActions, ExtrudeInputs } from "./extrude-inputs.js";
import { ExtrudeTargets } from "./extrude-targets.js";
import { ExtrudeTwist } from "./extrude-twist.js";
import { ExtrudeWidget } from "./extrude-widget.js";

/** Wire the distance, draft, twist and Boolean controls to one extrusion owner. */
export function createExtrudeView(
  editor: SketchEditor,
  overlay: HTMLElement,
  actions: ExtrudeActions,
  signal: AbortSignal,
  targetsChanged: () => void,
) {
  const targets = new ExtrudeTargets(editor, targetsChanged);
  const widget = new ExtrudeWidget(
    (mode) => {
      if (actions.begin()) actions.mode(mode);
    },
    () => {
      if (actions.begin()) actions.queue(actions.distance());
      editor.refresh();
    },
    (symmetric) => {
      if (actions.begin()) actions.queue(actions.distance(), symmetric);
    },
    actions.finish,
    actions.cancel,
  );
  const twist = new ExtrudeTwist(
    editor,
    widget.root,
    actions.begin,
    actions.lease,
    () => {
      actions.queue(actions.distance());
      editor.refresh();
    },
    signal,
  );
  widget.addQuantity(twist.row);
  widget.root.append(targets.root);
  overlay.append(widget.root);
  const inputs = new ExtrudeInputs(editor, widget, actions, signal);
  return { widget, targets, twist, inputs };
}
