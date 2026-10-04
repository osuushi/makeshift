import type { KernelRequest } from "./kernel-request.js";
import { array, number, object, positive, requireKernel, text } from "./kernel-values.js";
export function validateErosionQuality(
  reply: Record<string, unknown>,
  input: Extract<KernelRequest, { kind: "erode" }>,
): void {
  if (input.method === "accurate") {
    requireKernel(reply.erosionQuality === undefined, "Analytic erosion diagnostics");
    return;
  }
  const quality = array(reply.erosionQuality);
  requireKernel(quality.length === input.ids.length, "erosion diagnostic count");
  const seen = new Set<string>();
  for (const value of quality) {
    const q = object(value),
      id = text(q.body);
    requireKernel(input.ids.includes(id) && !seen.has(id), "erosion diagnostic body");
    seen.add(id);
    positive(q.spacing);
    for (const key of ["faces", "triangles", "samples"]) {
      const n = number(q[key]);
      requireKernel(Number.isInteger(n) && n >= 0, "erosion diagnostic count");
    }
    const faces = array(reply.results).reduce<number>((sum, value) => {
      const result = object(value);
      return sum + (array(result.predecessorBodies).includes(id) ? array(result.faces).length : 0);
    }, 0);
    requireKernel(q.faces === faces, "erosion diagnostic face count");
    requireKernel((faces === 0) === (q.samples === 0), "erosion measurement presence");
    requireKernel(number(q.faces) <= (input.maxFaces ?? 128), "erosion face budget");
    requireKernel(
      number(q.sampledMinThickness) <= number(q.sampledMaxThickness),
      "sampled thickness range",
    );
    requireKernel(number(q.sampledFitDeviation) >= 0, "sampled fit deviation");
  }
}
