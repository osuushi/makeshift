import { validateKernelBodies } from "./kernel-body-validation.js";
import { validateErosionQuality } from "./kernel-erosion-validation.js";
import { validateMeshFitReply } from "./kernel-mesh-fit-validation.js";
import {
  validateKernelCurves,
  validateKernelMeasurement,
  validateKernelTopology,
} from "./kernel-query-validation.js";
import type { KernelReply } from "./kernel-reply.js";
import type { KernelRequest } from "./kernel-request.js";
import { array, object, requireKernel, text } from "./kernel-values.js";

/** Validate the wire result before geometry, correspondence or measurements escape the adapter. */
export function readKernelReply<Input extends KernelRequest>(
  input: Input,
  value: unknown,
): KernelReply<Input> {
  const reply = object(value);
  switch (input.kind) {
    case "erode":
      validateKernelBodies(reply, input);
      validateErosionQuality(reply, input);
      break;
    case "fit-mesh": {
      validateMeshFitReply(reply, input);
      break;
    }
    case "project":
    case "offset-sketch":
      validateKernelCurves(reply.curves);
      break;
    case "measure":
      validateKernelMeasurement(reply.measurement);
      break;
    case "topology":
      validateKernelTopology(reply.topology, input);
      break;
    case "sections":
      for (const value of array(reply.sections)) {
        const section = object(value);
        requireKernel(
          input.bodies.some((body) => body.id === text(section.body)),
          "section body",
        );
        validateKernelCurves(section.curves);
      }
      break;
    case "edge-finish-selection": {
      const seen = new Set<string>();
      for (const value of array(reply.edgeSelection)) {
        const edge = object(value);
        const body = input.bodies.find((body) => body.id === text(edge.body));
        requireKernel(
          body?.edges.some((candidate) => candidate.id === text(edge.edge)),
          "selected edge",
        );
        const key = JSON.stringify([edge.body, edge.edge]);
        requireKernel(!seen.has(key), "duplicate selected edge");
        seen.add(key);
      }
      break;
    }
    default:
      validateKernelBodies(reply, input);
  }
  return reply as KernelReply<Input>;
}
