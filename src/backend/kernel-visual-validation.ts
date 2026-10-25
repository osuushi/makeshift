import { array, bounds, frame, numbers, object, requireKernel } from "./kernel-values.js";

export function validateVisualReply(reply: Record<string, unknown>): void {
  requireKernel(reply.presentation === "visual", "visual presentation");
  requireKernel(reply.mode === "new" || reply.mode === "union", "visual operation");
  requireKernel(array(reply.participants).length === 0, "visual participants");
  requireKernel(array(reply.tools).length === 0, "visual tools");
  const bodies = array(reply.results);
  requireKernel(bodies.length > 0, "visual bodies");
  for (const value of bodies) {
    const body = object(value);
    requireKernel(body.brep === undefined, "visual data cannot contain an exact body");
    bounds(body.bounds);
    const faces = array(body.faces);
    requireKernel(faces.length > 0, "visual faces");
    const planes = array(body.planes);
    requireKernel(planes.length === faces.length, "visual clipping planes");
    for (const plane of planes) if (plane !== null) frame(plane);
    for (const face of faces) {
      const vertices = numbers(face);
      requireKernel(vertices.length > 0 && vertices.length % 9 === 0, "visual triangles");
    }
    for (const edge of array(body.edges)) {
      const points = numbers(edge);
      requireKernel(points.length >= 6 && points.length % 3 === 0, "visual outline");
    }
  }
}
