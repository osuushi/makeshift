import type { Body, BooleanMode, Edge, Face } from "../model/body.js";
import { topologyOrigins } from "../model/body-correspondence.js";
import { newId } from "../sketch/document.js";

type Descendant<T> = Omit<T, "id"> & { predecessors: string[] };
export interface KernelResult<Mode extends BooleanMode | "inspect" = BooleanMode> {
  mode: Mode;
  participants: string[];
  /** Generated sweep operands for temporary display only. */
  tools?: KernelResult["results"];
  results: (Omit<Body, "id" | "faces" | "edges"> & {
    copy?: boolean;
    predecessorBodies: string[];
    faces: (Descendant<Omit<Face, "edges" | "blend" | "chamfer" | "offsetFaces" | "thickness">> & {
      thickness?: { faceIndex: number; distance: number; slope: 1 | -1 } | null;
      edgeIndexes: number[];
      offsetFaceIndexes?: number[];
      offsetSelected?: boolean;
      blend?: { radius: number; outward: 1 | -1; faceIndexes: number[] } | null;
      chamfer?: {
        distance: number;
        distanceScale: number;
        outward: 1 | -1;
        faceIndexes: number[];
      } | null;
    })[];
    edges: Descendant<Edge>[];
  })[];
}
type KernelBody = KernelResult<BooleanMode | "inspect">["results"][number];
function identityPlan(previous: readonly Body[], result: KernelResult<BooleanMode | "inspect">) {
  const retained = new Set(
    previous
      .filter((body) => !result.participants.includes(body.id))
      .flatMap((body) => [body.id, ...body.faces.map((f) => f.id), ...body.edges.map((e) => e.id)]),
  );
  const counts = new Map<string, number>();
  for (const body of result.results)
    for (const ids of [
      body.predecessorBodies,
      ...body.faces.map((f) => f.predecessors),
      ...body.edges.map((e) => e.predecessors),
    ])
      for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return (ids: string[]) =>
    ids.length === 1 && counts.get(ids[0]) === 1 && !retained.has(ids[0]) ? ids[0] : newId();
}
function reference(
  ids: readonly string[],
  index: number,
  kind: "face" | "thickness" | "offset" | "blend",
): string {
  if (!Number.isInteger(index) || !ids[index])
    throw new Error(`Kernel ${kind} references an invalid ${kind === "face" ? "edge" : "face"}`);
  return ids[index];
}
function materializeFace(
  source: KernelBody["faces"][number],
  id: string,
  faceIds: string[],
  edgeIds: string[],
): Face {
  const {
    predecessors: _predecessors,
    edgeIndexes,
    offsetFaceIndexes,
    offsetSelected: _offsetSelected,
    blend,
    chamfer,
    thickness,
    ...face
  } = source;
  return {
    ...face,
    id,
    chamfer: chamfer
      ? {
          distance: chamfer.distance,
          distanceScale: chamfer.distanceScale,
          outward: chamfer.outward,
          faces: chamfer.faceIndexes.map((i) => reference(faceIds, i, "blend")),
        }
      : null,
    thickness: thickness
      ? {
          face: reference(faceIds, thickness.faceIndex, "thickness"),
          distance: thickness.distance,
          slope: thickness.slope,
        }
      : null,
    offsetFaces: offsetFaceIndexes?.map((i) => reference(faceIds, i, "offset")),
    blend: blend
      ? {
          radius: blend.radius,
          outward: blend.outward,
          faces: blend.faceIndexes.map((i) => reference(faceIds, i, "blend")),
        }
      : null,
    edges: edgeIndexes.map((i) => reference(edgeIds, i, "face")),
  };
}
/** Preserve IDs only for one-to-one continuations. A split/merge gets new identities. */
export function materialize(
  previous: readonly Body[],
  result: KernelResult<BooleanMode | "inspect">,
): Body[] {
  const identity = identityPlan(previous, result);
  const bodies = result.results.map(
    ({ predecessorBodies, faces, edges, copy = false, ...body }) => {
      const identify = (ids: string[]) => (copy ? newId() : identity(ids));
      const mappedEdges = edges.map(({ predecessors, ...edge }) => ({
        ...edge,
        id: identify(predecessors),
      }));
      const faceIds = faces.map(({ predecessors }) => identify(predecessors));
      const edgeIds = mappedEdges.map((edge) => edge.id);
      const materialized: Body = {
        ...body,
        id: identify(predecessorBodies),
        faces: faces.map((face, index) => materializeFace(face, faceIds[index], faceIds, edgeIds)),
        edges: mappedEdges,
      };
      topologyOrigins.set(materialized, {
        bodies: predecessorBodies,
        copy,
        edges: new Map(edges.map((edge, index) => [edgeIds[index], edge.predecessors])),
        faces: new Map(faces.map((face, index) => [faceIds[index], face.predecessors])),
      });
      return materialized;
    },
  );
  return [...previous.filter((body) => !result.participants.includes(body.id)), ...bodies];
}

/** Transforms and fillets continue each body in place, including entity-list order. */
export function continuingBodies(previous: readonly Body[], next: Body[]): Body[] {
  if (previous.length !== next.length) throw new Error("Operation changed the body count");
  return previous.map((body) => {
    const continued = next.find((candidate) => candidate.id === body.id);
    if (!continued) throw new Error("Operation lost body identity");
    return continued;
  });
}
