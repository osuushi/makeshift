import type { Extrusion } from "../model/body.js";
import { visualExtrusion } from "../model/visual-preview.js";
import type { SketchDocument } from "../sketch/document.js";
import { kernelInput } from "./kernel-input.js";
import type { SolidCalculator } from "./solid-calculator.js";

export async function extrudeVisual(
  kernel: SolidCalculator,
  document: SketchDocument,
  extrusion: Extrusion,
) {
  if (!visualExtrusion(extrusion, document.bodies?.length ?? 0))
    throw new Error("Visual preview requires a straight sketch extrusion into a new body");
  return kernel.calculate({
    ...kernelInput(document, extrusion, document.bodies ?? []),
    presentation: "visual",
  });
}
