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
  if (!visualExtrusion(extrusion, document.bodies ?? []))
    throw new Error("Visual preview requires a straight extrusion from a sketch or planar face");
  return kernel.calculate({
    ...kernelInput(document, extrusion, document.bodies ?? []),
    presentation: "visual",
  });
}
