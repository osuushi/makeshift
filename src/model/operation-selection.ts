import type { SketchDocument } from "../sketch/document.js";
import type { ModelingTarget } from "../sketch/model-selection-state.js";
import { parallelNormals, planeNormal, type Vector } from "../sketch/planes.js";
import type { Body, BodyEdgeFinish, BodyFaceOffset, BodyShell, Face, LiftSource } from "./body.js";
import { type CleanupSelection, cleanupSelection } from "./cleanup.js";
import { featureEdges } from "./feature-edges.js";
import { expandedSelection, type SelectionContext, selectionContext } from "./selection-context.js";

export interface MovementSelection {
  bodies: Body[];
  faces: BodyFaceOffset["faces"];
  edges: BodyEdgeFinish["edges"];
}
export interface DeletionSelection {
  bodyIds: string[];
  sketchIds: string[];
  topology: CleanupSelection[];
}
export interface OperationInputs {
  scale: MovementSelection;
  move: MovementSelection;
  duplicate: Body[];
  mirror: Body[];
  boolean: Body[];
  shell: BodyShell["selection"];
  erode: Body[];
  offset: { targets: BodyFaceOffset["faces"]; faces: Face[] };
  fillet: BodyEdgeFinish["edges"];
  chamfer: BodyEdgeFinish["edges"];
  extrude: LiftSource[];
  revolve: LiftSource[];
  loft: LiftSource[];
  cleanup: CleanupSelection[];
  delete: DeletionSelection;
}
export type Operation = keyof OperationInputs;
export type Resolution<T> = { available: true; inputs: T } | { available: false; reason: string };
const unavailable = (reason: string): Resolution<never> => ({ available: false, reason });
const available = <T>(inputs: T): Resolution<T> => ({ available: true, inputs });

/** Concrete operation inputs and eligibility are resolved together, without changing selection. */
export function resolveOperation<K extends Operation>(
  operation: K,
  targets: readonly ModelingTarget[],
  document: SketchDocument,
): Resolution<OperationInputs[K]> {
  const context = selectionContext(targets, document);
  if (!context.ordered.length) return unavailable("Select geometry first");
  if (!context.valid) return unavailable("The selection contains geometry that no longer exists");
  return resolvers[operation](context, document);
}

type Resolver<K extends Operation> = (
  c: SelectionContext,
  document: SketchDocument,
) => Resolution<OperationInputs[K]>;

/** Each entry must return the inputs declared by its operation, checked without casts. */
const resolvers: { [K in Operation]: Resolver<K> } = {
  scale: movementSelection,
  move: movementSelection,
  duplicate: wholeBodySelection,
  mirror: wholeBodySelection,
  boolean: (c) => {
    const result = wholeBodySelection(c);
    return result.available && result.inputs.length < 2
      ? unavailable("Select geometry from at least two bodies")
      : result;
  },
  shell: shellSelection,
  erode: wholeBodySelection,
  offset: offsetSelection,
  fillet: edgeSelection,
  chamfer: edgeSelection,
  extrude: liftSelection,
  revolve: liftSelection,
  loft: loftSelection,
  cleanup: (c) =>
    solidOnly(c)
      ? available(cleanupSelection(coverageTargets(c)))
      : unavailable("Cleanup requires solid geometry"),
  delete: deletionSelection,
};

const solidOnly = (c: SelectionContext) => c.ordered.every((t) => "body" in t);
function uncoveredEdges(c: SelectionContext) {
  const whole = new Set(c.complete.map((b) => b.id));
  return c.edges.filter((t) => !whole.has(t.body));
}
function movementSelection(c: SelectionContext): Resolution<MovementSelection> {
  if (!solidOnly(c)) return unavailable("Move requires bodies, faces or edges");
  const remainingEdges = uncoveredEdges(c);
  if (c.partialFaces.length && remainingEdges.length)
    return unavailable("Moving partial faces and edges together is not supported");
  return available({
    bodies: c.complete,
    faces: c.partialFaces.map(({ body, face }) => ({ body, face })),
    edges: remainingEdges.map(({ body, edge }) => ({ body, edge })),
  });
}
function wholeBodySelection(c: SelectionContext): Resolution<Body[]> {
  if (!solidOnly(c) || !c.owners.length) return unavailable("Select solid bodies, faces or edges");
  return available(c.owners);
}
function edgeSelection(
  c: SelectionContext,
  document: SketchDocument,
): Resolution<BodyEdgeFinish["edges"]> {
  if (!c.ordered.every((target) => target.kind === "edge" || target.kind === "face"))
    return unavailable("Select solid faces or explicit edges");
  const edges: BodyEdgeFinish["edges"] = [];
  const seen = new Set<string>();
  for (const target of c.ordered) {
    if (target.kind !== "edge" && target.kind !== "face") continue;
    const body = document.bodies?.find((body) => body.id === target.body);
    const ids =
      target.kind === "edge"
        ? [target.edge]
        : (body?.faces.find((face) => face.id === target.face)?.edges ?? []);
    if (!body || !ids.length || ids.some((id) => !body.edges.some((edge) => edge.id === id)))
      return unavailable("A selected face has no valid boundary edges");
    // Periodic seams occur twice in a face wire, but are not modeling boundaries.
    // Explicit edge targets still reach the kernel's ordinary eligibility check.
    const features = new Set(featureEdges(body).map((edge) => edge.id));
    const boundary = target.kind === "edge" ? ids : ids.filter((id) => features.has(id));
    if (!boundary.length) return unavailable("A selected face has no valid boundary edges");
    for (const id of boundary) {
      const key = `${target.body}:${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ body: target.body, edge: id });
    }
  }
  return available(edges);
}
function offsetSelection(
  c: SelectionContext,
  document: SketchDocument,
): Resolution<OperationInputs["offset"]> {
  if (!solidOnly(c) || c.edges.length)
    return unavailable("Offset requires faces or complete bodies");
  const faces = c.faces.flatMap(
    (t) =>
      document.bodies?.find((b) => b.id === t.body)?.faces.filter((f) => f.id === t.face) ?? [],
  );
  if (faces.length !== c.faces.length) return unavailable("A selected face no longer exists");
  if (faces.some((f) => !f.plane && !f.cylinder && !f.offsetHandle))
    return unavailable("A selected face has no supported offset direction");
  return available({ targets: c.faces.map(({ body, face }) => ({ body, face })), faces });
}
function deletionSelection(c: SelectionContext): Resolution<DeletionSelection> {
  if (c.ordered.some((t) => t.kind === "profile"))
    return unavailable("Select whole sketches to delete them");
  return available({
    bodyIds: c.complete.map((b) => b.id),
    sketchIds: c.ordered.flatMap((t) => (t.kind === "sketch" ? [t.sketch] : [])),
    topology: cleanupSelection([...c.partialFaces, ...uncoveredEdges(c)]),
  });
}

/** Collapse complete coverage for operations whose whole-body meaning is authoritative. */
export function coverageTargets(c: SelectionContext): ModelingTarget[] {
  const whole = new Set(c.complete.map((b) => b.id));
  const seen = new Set<string>();
  return c.ordered.flatMap((t): ModelingTarget[] => {
    if (!("body" in t) || !whole.has(t.body)) return [t];
    if (seen.has(t.body)) return [];
    seen.add(t.body);
    return [{ kind: "body", body: t.body }];
  });
}

function liftSelection(c: SelectionContext, document: SketchDocument): Resolution<LiftSource[]> {
  let normal: Vector | null = null;
  const sources: LiftSource[] = [];
  for (const t of expandedSelection(c)) {
    const plane =
      t.kind === "face"
        ? document.bodies?.find((b) => b.id === t.body)?.faces.find((f) => f.id === t.face)?.plane
        : t.kind === "profile"
          ? document.sketches.find((s) => s.id === t.sketch)?.plane
          : null;
    if (!plane)
      return unavailable("Select planar faces or filled sketch regions with a common direction");
    const n = planeNormal(plane);
    if (normal && !parallelNormals(normal, n))
      return unavailable("Selected surfaces must have parallel planes");
    normal ??= n;
    if (t.kind === "face") sources.push({ face: t.face });
    if (t.kind === "profile") sources.push({ sketch: t.sketch, profile: t.profile.key });
  }
  return available(sources);
}

function shellSelection(c: SelectionContext): Resolution<BodyShell["selection"]> {
  if (!solidOnly(c) || c.edges.length) return unavailable("Shell requires bodies or opening faces");
  const ids = [...new Set(c.faces.map((f) => f.body))];
  return available(
    ids.map((body) => ({
      body,
      faces: c.partialFaces.filter((f) => f.body === body).map((f) => f.face),
    })),
  );
}

function loftSelection(c: SelectionContext, document: SketchDocument): Resolution<LiftSource[]> {
  if (c.ordered.length < 2)
    return unavailable(
      "Select at least two ordered loft sections, or clear selection to collect them in Loft",
    );
  const sources: LiftSource[] = [];
  for (const target of c.ordered) {
    if (target.kind === "profile")
      sources.push({ sketch: target.sketch, profile: target.profile.key });
    else if (
      target.kind === "face" &&
      document.bodies?.find((b) => b.id === target.body)?.faces.find((f) => f.id === target.face)
        ?.plane
    )
      sources.push({ face: target.face });
    else return unavailable("Loft sections must be filled sketch regions or planar faces");
  }
  return available(sources);
}
