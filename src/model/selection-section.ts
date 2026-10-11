import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { coplanar, type PlaneFrame } from "../sketch/planes.js";

/** Resolve only unambiguous planar selections from accepted geometry. */
export function selectedSectionFrame(
  editor: SketchEditor,
  reference: PlaneFrame | undefined,
): PlaneFrame | null {
  if (reference) return reference;
  const frames = editor.modeling.targets.map((target) => {
    if (target.kind === "sketch" || target.kind === "profile")
      return editor.store.data.sketches.find((sketch) => sketch.id === target.sketch)?.plane;
    if (target.kind === "face")
      return editor.store.data.bodies
        ?.find((body) => body.id === target.body)
        ?.faces.find((face) => face.id === target.face)?.plane;
    return null;
  });
  const first = frames[0];
  return first && frames.every((frame) => frame && coplanar(first, frame)) ? first : null;
}

/** Pin the source plane while tools replace selected topology with preview geometry. */
export class SelectionSection {
  private lease: InteractionLease | null = null;
  private frame: PlaneFrame | null = null;

  read(frame: PlaneFrame | null, interaction: InteractionLease | null): PlaneFrame | null {
    const editing =
      interaction &&
      ![
        "pointer",
        "model-selection",
        "selection-choice",
        "cross-section",
        "construction-plane",
      ].includes(interaction.kind);
    if (!editing) {
      this.lease = null;
      this.frame = frame ? structuredClone(frame) : null;
    } else if (this.lease !== interaction) {
      this.lease = interaction;
      this.frame = frame ? structuredClone(frame) : this.frame;
    } else if (!this.frame && frame) {
      this.frame = structuredClone(frame);
    }
    return this.frame;
  }
}

export function installSelectionSection(
  editor: SketchEditor,
  selectedPlane: () => PlaneFrame | undefined,
): () => void {
  const section = new SelectionSection();
  editor.world.selectionSection = () =>
    section.read(
      editor.world.activeFrame ?? selectedSectionFrame(editor, selectedPlane()),
      editor.interactions.current,
    );
  return () => {
    editor.world.selectionSection = () => null;
  };
}
