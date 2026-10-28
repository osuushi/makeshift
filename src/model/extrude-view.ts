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

/** Presentation updates run after the controller has chosen its current inputs. */
export function updateExtrudeView(
  editor: SketchEditor,
  interaction: { active: boolean },
  view: { widget: ExtrudeWidget; twist: ExtrudeTwist; targets: ExtrudeTargets },
  state: {
    distance: number;
    mode: import("./body.js").Extrusion["mode"] | undefined;
    valid: boolean;
    symmetric: boolean;
    pending: boolean;
  },
): void {
  const { widget, twist, targets } = view;
  const { active } = interaction;
  if (widget.prerequisites.update(editor, "extrude")) return;
  widget.update(
    editor,
    active,
    state.distance,
    state.mode,
    state.valid,
    twist.value,
    state.symmetric,
  );
  twist.update(widget.axis, active, state.distance, state.valid, state.symmetric);
  twist.row.hidden = !!widget.axis?.normalExtrusion;
  widget.root.dataset.previewPending = String(
    active && state.pending && !state.valid && editor.store.working,
  );
  if (
    (!active && editor.modeling.tool !== "extrude") ||
    (editor.interactions.current && editor.interactions.current.kind !== "extrude")
  )
    widget.root.hidden = true;
  targets.update(active && state.mode !== "new" && !!editor.store.data.bodies?.length);
  widget.fit();
}
