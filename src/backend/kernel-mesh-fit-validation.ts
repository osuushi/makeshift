import { validateKernelBodies } from "./kernel-body-validation.js";
import type { KernelRequest } from "./kernel-request.js";
import { array, number, object, requireKernel } from "./kernel-values.js";

export function validateMeshFitReply(
  reply: Record<string, unknown>,
  input: Extract<KernelRequest, { kind: "fit-mesh" }>,
): void {
  validateKernelBodies(reply, input);
  requireKernel(
    array(reply.results).length === 1 && array(reply.participants).length === 0,
    "fitted solid count",
  );
  const fit = object(reply.fit);
  if (!("layout" in input)) {
    const errors = array(fit.vertexErrors);
    requireKernel(errors.length === input.mesh.vertices.length, "mesh deviation count");
    for (const error of errors)
      requireKernel(
        number(error) >= 0 && number(error) <= input.tolerance,
        "mesh vertex deviation",
      );
  }
  if (fit.analyticFaces !== undefined) {
    const counts = object(fit.analyticFaces);
    const faces = ["planes", "cylinders", "spheres"].map((key) => number(counts[key]));
    requireKernel(
      faces.every((n) => Number.isInteger(n) && n >= 0),
      "analytic face counts",
    );
    requireKernel(
      faces.reduce((sum, n) => sum + n, 0) === number(fit.patches),
      "analytic face total",
    );
    requireKernel(number(fit.controlPoints) === 0, "analytic fit has no Bezier controls");
  } else {
    requireKernel(
      Number.isInteger(number(fit.controlPoints)) && number(fit.controlPoints) > 0,
      "mesh fit control count",
    );
  }
  for (const key of ["patches", "samples"]) {
    const n = number(fit[key]);
    requireKernel(Number.isInteger(n) && n > 0, "mesh fit counts");
  }
  requireKernel(number(fit.patches) <= (input.maxPatches ?? 256), "fit patch budget");
  for (const key of ["sampledSurfaceToMesh", "sampledMeshToSurface", "sampledRms"])
    requireKernel(
      number(fit[key]) >= 0 && number(fit[key]) <= input.tolerance,
      "mesh fit deviation",
    );
  requireKernel(
    number(fit.sampledSeamAngle) >= 0 && number(fit.sampledSeamAngle) <= (input.smoothAngle ?? 5),
    "mesh fit seam angle",
  );
}
