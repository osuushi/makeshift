import type { MeshFitResult } from "../agent-script/api.js";
import { type MeshFitInput, validateMeshFit } from "../model/mesh-fit.js";
import type { SketchDocument } from "../sketch/document.js";
import { materialize } from "./kernel-result.js";
import type { SolidCalculator } from "./solid-calculator.js";

export async function scriptMeshFit(
  document: SketchDocument,
  input: MeshFitInput,
  kernel: SolidCalculator,
): Promise<{ document: SketchDocument; result: MeshFitResult }> {
  validateMeshFit(input);
  const fitted = await kernel.calculate({ ...input, kind: "fit-mesh", bodies: [] });
  const bodies = materialize(document.bodies ?? [], fitted);
  return {
    document: { ...document, bodies },
    result: {
      fit: fitted.fit,
      bodies: bodies.map((b) => ({
        id: b.id,
        volume: b.volume,
        faces: b.faces.map((f) => f.id),
        edges: b.edges.map((e) => e.id),
      })),
    },
  };
}
