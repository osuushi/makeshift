import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import type { Revolution } from "./body.js";
import type { extrusionAxis } from "./extrude-axis.js";
import { axisInPlane, pickRevolveAxis, type RevolveAxis } from "./revolve-axis.js";

interface RevolveActions {
  state: () => {
    lease: InteractionLease | null;
    frame: ReturnType<typeof extrusionAxis>;
    picking: boolean;
    hover: RevolveAxis | null;
  };
  hover: (axis: RevolveAxis | null) => void;
  choose: (axis: RevolveAxis) => void;
  mode: (mode: Revolution["mode"]) => void;
  cancel: () => Promise<void>;
  finish: () => Promise<boolean>;
}
/** Picking and key ownership for one ordinary revolution interaction. */
export class RevolveInputs {
  constructor(
    private editor: SketchEditor,
    signal: AbortSignal,
    private actions: RevolveActions,
  ) {
    const options = { signal, capture: true };
    this.picking(options);
    this.keys(options);
  }
  private picking(options: AddEventListenerOptions): void {
    const canvas = this.editor.world.canvas;
    canvas.addEventListener(
      "pointermove",
      (event) => {
        const state = this.actions.state();
        if (!state.picking || !state.lease || event.buttons) return;
        const axis = pickRevolveAxis(this.editor, { x: event.clientX, y: event.clientY });
        this.actions.hover(
          axis && state.frame && axisInPlane(axis, state.frame.center, state.frame.normal)
            ? axis
            : null,
        );
      },
      options,
    );
    canvas.addEventListener(
      "pointerleave",
      () => {
        const state = this.actions.state();
        if (state.picking && state.hover) this.actions.hover(null);
      },
      options,
    );
    canvas.addEventListener(
      "click",
      (event) => {
        const state = this.actions.state();
        if (!state.picking || !state.lease || event.button || event.metaKey || event.ctrlKey)
          return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const axis = pickRevolveAxis(this.editor, { x: event.clientX, y: event.clientY });
        if (!axis || !state.frame) return;
        if (!axisInPlane(axis, state.frame.center, state.frame.normal)) {
          this.editor.message = "Choose an axis in the profile plane";
          this.editor.refresh();
          return;
        }
        this.actions.choose(axis);
      },
      options,
    );
  }
  private keys(options: AddEventListenerOptions): void {
    onModelKeydown((event) => {
      if (!this.actions.state().lease) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        void this.actions.cancel();
      } else if (event.key === "Enter") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.target instanceof HTMLInputElement) {
          event.target.blur();
          this.editor.world.canvas.focus();
        } else void this.actions.finish();
      } else if (!(event.target instanceof HTMLInputElement)) {
        const mode = ({ u: "union", s: "subtract", i: "intersect", n: "new" } as const)[
          event.key.toLowerCase() as "u"
        ];
        if (mode) {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.actions.mode(mode);
        }
      }
    }, options);
  }
}
