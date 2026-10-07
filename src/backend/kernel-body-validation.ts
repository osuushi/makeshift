import type { KernelRequest } from "./kernel-request.js";
import {
  analyticCurve,
  array,
  bounds,
  flag,
  frame,
  indexes,
  number,
  numbers,
  object,
  positive,
  references,
  requireKernel,
  sign,
  text,
  vector,
} from "./kernel-values.js";

function surface(face: Record<string, unknown>): void {
  if (face.plane !== null) frame(face.plane);
  for (const name of ["cylinder", "sphere", "cone", "offsetHandle"] as const) {
    if (face[name] == null) continue;
    const value = object(face[name]);
    if (name === "offsetHandle") {
      vector(value.center);
      vector(value.normal, true);
      continue;
    }
    sign(value.outward);
    if (name === "cone") {
      vector(value.apex);
      vector(value.axis, true);
      requireKernel(Math.abs(number(value.semiAngle)) < 90, "cone angle");
    } else {
      positive(value.radius);
      if (name === "cylinder") {
        vector(value.origin);
        vector(value.axis, true);
      }
    }
  }
}
function face(value: unknown, faces: number, edges: number, known: ReadonlySet<string>): void {
  const f = object(value);
  references(f.predecessors, known);
  numbers(f.signature, 6);
  requireKernel(numbers(f.vertices).length % 9 === 0, "triangle coordinates");
  indexes(f.edgeIndexes, edges); // A seam can repeat an edge occurrence.
  if (f.offsetFaceIndexes !== undefined) indexes(f.offsetFaceIndexes, faces);
  if (f.offsetSelected !== undefined) flag(f.offsetSelected);
  if (f.blend != null) {
    const blend = object(f.blend);
    positive(blend.radius);
    sign(blend.outward);
    indexes(blend.faceIndexes, faces);
  }
  if (f.chamfer != null) {
    const chamfer = object(f.chamfer);
    positive(chamfer.distance);
    positive(chamfer.distanceScale);
    sign(chamfer.outward);
    indexes(chamfer.faceIndexes, faces);
  }
  if (f.thickness != null) {
    const thickness = object(f.thickness);
    indexes([thickness.faceIndex], faces);
    positive(thickness.distance);
    sign(thickness.slope);
  }
  surface(f);
}
export function validateKernelBodies(reply: Record<string, unknown>, input: KernelRequest): void {
  const mode =
    input.kind === "inspect"
      ? "inspect"
      : ["extrude", "revolve", "path-sweep", "loft", "boolean"].includes(input.kind) &&
          "mode" in input
        ? input.mode
        : "new";
  requireKernel(
    mode === "auto" ? reply.mode === "union" || reply.mode === "subtract" : reply.mode === mode,
    "operation mode",
  );
  const bodyIds = new Set(input.bodies.map((body) => body.id));
  const faceIds = new Set(input.bodies.flatMap((body) => body.faces.map((face) => face.id)));
  const edgeIds = new Set(input.bodies.flatMap((body) => body.edges.map((edge) => edge.id)));
  references(reply.participants, bodyIds);
  for (const value of array(reply.results)) {
    const body = object(value);
    const brep = text(body.brep);
    requireKernel(brep.length % 2 === 0 && /^[0-9a-f]+$/.test(brep), "exact shape encoding");
    requireKernel(number(body.volume) >= 0, "body volume");
    vector(body.center);
    bounds(body.bounds);
    references(body.predecessorBodies, bodyIds);
    if (body.copy !== undefined) flag(body.copy);
    const faces = array(body.faces),
      edges = array(body.edges);
    for (const value of faces) face(value, faces.length, edges.length, faceIds);
    for (const value of edges) {
      const edge = object(value);
      references(edge.predecessors, edgeIds);
      numbers(edge.signature, 6);
      requireKernel(numbers(edge.points).length % 3 === 0, "edge coordinates");
      if (edge.curve !== null) analyticCurve(edge.curve);
    }
  }
}
