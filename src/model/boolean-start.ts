import type { SketchEditor } from "../sketch/editor.js";
import type { Body } from "./body.js";
import type { Resolution } from "./operation-selection.js";

/** Collect owning bodies from any solid selection; geometry still needs two. */
export function booleanStart(editor: SketchEditor): Resolution<Body[]> {
  if (!editor.modeling.targets.length) return { available: true, inputs: [] };
  return editor.modeling.resolve("duplicate");
}
