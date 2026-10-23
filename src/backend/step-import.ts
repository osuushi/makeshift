import type { SketchDocument } from "../sketch/document.js";
import { materialize } from "./kernel-result.js";
import type { SolidCalculator } from "./solid-calculator.js";

export async function importStep(
  kernel: SolidCalculator,
  document: SketchDocument,
  step: string,
): Promise<SketchDocument> {
  if (typeof step !== "string" || !step.length || step.length > 25 * 1024 * 1024)
    throw new Error("Choose a nonempty STEP file smaller than 25 MB");
  const result = await kernel.calculate({ kind: "import-step", step, bodies: [] });
  return { ...document, bodies: materialize(document.bodies ?? [], result) };
}
