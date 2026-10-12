import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import { pickMirrorReference } from "./mirror-reference.js";

export function installMirrorEvents(
  editor: SketchEditor,
  signal: AbortSignal,
  active: () => boolean,
  choose: (reference: NonNullable<ReturnType<typeof pickMirrorReference>>) => void,
  checkpoint: () => void,
  cancel: () => Promise<void>,
  finish: () => Promise<boolean>,
): void {
  const e = editor,
    options = { signal, capture: true };
  e.world.canvas.addEventListener(
    "pointerdown",
    (event) => {
      if (!active() || event.button || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    options,
  );
  e.world.canvas.addEventListener(
    "click",
    (event) => {
      if (!active() || event.button || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (e.blocked) return;
      const reference = pickMirrorReference(e, { x: event.clientX, y: event.clientY });
      if (!reference) {
        e.message = "Pick a sketch axis, straight line, world plane or planar face";
        e.refresh();
        return;
      }
      choose(reference);
      checkpoint();
    },
    options,
  );
  e.world.canvas.addEventListener(
    "dblclick",
    (event) => {
      if (active()) event.stopImmediatePropagation();
    },
    options,
  );
  e.world.canvas.addEventListener(
    "pointermove",
    (event) => {
      if (!active() || event.buttons) return;
      event.stopImmediatePropagation();
    },
    options,
  );
  onModelKeydown((event) => {
    if (!active()) return;
    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "z")
      return;
    if (event.key === "Escape" || event.key === "Enter") {
      event.preventDefault();
      if (event.key === "Escape") void cancel();
      else void finish();
    }
    // The tool owns CAD shortcuts while text input and camera gestures stay ordinary.
    event.stopImmediatePropagation();
  }, options);
}
