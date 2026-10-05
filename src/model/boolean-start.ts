import type { SketchEditor } from "../sketch/editor.js";
import type { Body } from "./body.js";
import type { Resolution } from "./operation-selection.js";

/** Tool collection may start empty or with one complete body; geometry still needs two. */
export function booleanStart(editor: SketchEditor): Resolution<Body[]> {
  if (!editor.modeling.targets.length) return { available: true, inputs: [] };
  return editor.modeling.resolve("duplicate");
}
