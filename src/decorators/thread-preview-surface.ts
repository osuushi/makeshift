import type { Face } from "../model/body.js";
import type { ExportMesh } from "../model/export-mesh.js";
import type { PlaneFrame, Vector } from "../sketch/planes.js";
import { cross, dot, subtract } from "./cylinder.js";

/** End planes also clip partial MSAA fragments whose centers exceed the mesh boundary. */
export function threadPreviewPlanes(faces: readonly Face[], adjacent: readonly Face[]) {
  return adjacent.flatMap((face) => {
    const plane = face.plane;
    if (!plane || !faces.some((support) => support.edges.some((id) => face.edges.includes(id))))
      return [];
    const normal = cross(plane.u, plane.v);
    let low = Infinity,
      high = -Infinity;
    for (const support of faces)
      for (let i = 0; i < support.vertices.length; i += 3) {
        const distance = dot(
          normal,
          subtract(support.vertices.slice(i, i + 3) as Vector, plane.origin),
        );
        low = Math.min(low, distance);
        high = Math.max(high, distance);
      }
    if (low < -1e-7 && high > 1e-7) return [];
    const side = high > 1e-7 ? 1 : low < -1e-7 ? -1 : 0;
    if (!side) return [];
    const inward = normal.map((component) => component * side) as Vector;
    return [{ normal: inward, constant: -dot(inward, plane.origin) - 1e-6 }];
  });
}

/** Closure facets are needed for volume clipping, but are not threaded surfaces. */
export function threadPreviewSurface(
  mesh: ExportMesh,
  frame: PlaneFrame,
  faces: readonly Face[],
  adjacent: readonly Face[],
  auxiliary: { radius: number; segments: number },
): ExportMesh {
  const planes = adjacent.flatMap((face) => {
    if (
      !face.plane ||
      !faces.some((support) => support.edges.some((id) => face.edges.includes(id)))
    )
      return [];
    return [{ origin: face.plane.origin, normal: cross(face.plane.u, face.plane.v) }];
  });
  // Axis is the saved frame normal, not a face's potentially reversed cylinder axis.
  const axis = cross(frame.u, frame.v);
  const step = (2 * Math.PI) / auxiliary.segments;
  const auxiliarySkin = mesh.vertices.map((point) => {
    const delta = subtract(point as Vector, frame.origin);
    const u = dot(delta, frame.u),
      v = dot(delta, frame.v);
    const angle = Math.atan2(v, u);
    const middle = (Math.floor(angle / step) + 0.5) * step;
    // Clipping inserts vertices along these polygon facets. Test their supporting
    // planes, not the analytic circle, with room for Manifold's Float32 transport.
    return (
      Math.abs(
        Math.hypot(u, v) * Math.cos(angle - middle) - auxiliary.radius * Math.cos(step / 2),
      ) < 1e-5
    );
  });
  return {
    vertices: mesh.vertices,
    triangles: mesh.triangles.filter((triangle) => {
      if (triangle.every((index) => auxiliarySkin[index])) return false;
      const points = triangle.map((index) => mesh.vertices[index] as Vector);
      const levels = points.map((point) => dot(axis, subtract(point, frame.origin)));
      if (Math.max(...levels) - Math.min(...levels) < 1e-7) return false;
      return !planes.some(({ normal, origin }) =>
        points.every((point) => Math.abs(dot(normal, subtract(point, origin))) < 1e-7),
      );
    }),
  };
}
