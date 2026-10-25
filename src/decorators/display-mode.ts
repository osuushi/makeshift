import type { SketchDocument } from "../sketch/document.js";
import type { DecoratorEdit, DecoratorInstance } from "./types.js";

export type DecoratorDisplayMode = "detailed" | "texture" | "color-only";

export function validDecoratorDisplay(mode: unknown): mode is DecoratorDisplayMode {
  return mode === "detailed" || mode === "texture" || mode === "color-only";
}

export function effectiveDecoratorDisplay(
  instance: Pick<DecoratorInstance, "display">,
  defaultMode: DecoratorDisplayMode,
): DecoratorDisplayMode {
  return instance.display ?? defaultMode;
}

/** Display overrides are saved metadata, independent of geometry/plugin settings and presets. */
export function editDecoratorDisplay(
  document: SketchDocument,
  edit: Extract<DecoratorEdit, { action: "display" }>,
): readonly DecoratorInstance[] {
  if (edit.mode !== "default" && !validDecoratorDisplay(edit.mode))
    throw new Error("Choose a valid decorator display mode");
  const previous = document.decorators ?? [];
  if (
    !Array.isArray(edit.ids) ||
    !edit.ids.length ||
    edit.ids.some((id) => !previous.some((d) => d.id === id))
  )
    throw new Error("Select existing decorators");
  return previous.map((instance) => {
    if (!edit.ids.includes(instance.id)) return instance;
    const next = { ...instance };
    if (edit.mode === "default") delete next.display;
    else next.display = edit.mode;
    return next;
  });
}
