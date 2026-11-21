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
import { array, frame, object, positive, requireKernel, text, vector } from "./kernel-values.js";
import { validateVisualReply } from "./kernel-visual-validation.js";

/** Validate the wire result before geometry, correspondence or measurements escape the adapter. */
export function readKernelReply<Input extends KernelRequest>(
  input: Input,
  value: unknown,
  completed?: KernelRequest,
): KernelReply<Input> {
  const reply = object(value);
  if ("presentation" in input && input.presentation) {
    validateVisualReply(reply, input);
    return reply as KernelReply<Input>;
  }
  requireKernel(reply.presentation === undefined, "complete presentation required");
  // Completion consumes a retained shape. Its kind, Boolean mode and allowed
  // predecessor identities come from the exact operands that produced it.
  const bodyRequest = input.kind === "complete-preview" && completed ? completed : input;
  switch (input.kind) {
    case "edge-finish-targets": {
      const sizes = array(reply.edgeFinishTargets);
      requireKernel(sizes.length === input.points.length, "edge finish target count");
      for (const size of sizes) if (size !== null) positive(size);
      break;
    }
    case "center-of-mass":
      vector(reply.centerOfMass);
      break;
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
    case "describe-revolved-profile": {
      const profile = object(reply.profile);
      frame(profile.frame);
      positive(profile.height);
      requireKernel(typeof profile.endGuides === "boolean", "profile end guides");
      const body = input.bodies.find((body) => body.id === input.body);
      const spans = array(profile.spans);
      requireKernel(!!body && spans.length > 0, "profile source");
      for (const value of spans) {
        const span = object(value);
        requireKernel(
          body.faces.some((face) => face.id === text(span.face)),
          "profile face",
        );
        validateKernelCurves(span.curves);
      }
      break;
    }
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
      validateKernelBodies(reply, bodyRequest);
  }
  if (reply.tools !== undefined)
    validateKernelBodies({ ...reply, results: reply.tools }, bodyRequest);
  return reply as KernelReply<Input>;
}
