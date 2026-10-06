import type { SketchDocument } from "../sketch/document.js";
import type { ModelingTarget } from "../sketch/model-selection-state.js";
import type { Body } from "./body.js";

export type FaceTarget = Extract<ModelingTarget, { kind: "face" }>;
export type EdgeTarget = Extract<ModelingTarget, { kind: "edge" }>;
export interface SelectionContext {
  ordered: readonly ModelingTarget[];
  /** Whole-body tokens expanded, with existing face order retained. */
  faces: FaceTarget[];
  edges: EdgeTarget[];
  /** Owning bodies in first target encounter order, regardless of coverage. */
  owners: Body[];
  complete: Body[];
  partialFaces: FaceTarget[];
  valid: boolean;
}
const key = (t: ModelingTarget) =>
  t.kind === "body"
    ? `body:${t.body}`
    : t.kind === "face"
      ? `face:${t.body}:${t.face}`
      : t.kind === "edge"
        ? `edge:${t.body}:${t.edge}`
        : `${t.kind}:${t.sketch}:${t.kind === "profile" ? t.profile.key : ""}`;

/** Derived from accepted topology; never a second selection or geometry document. */
export function selectionContext(
  targets: readonly ModelingTarget[],
  document: SketchDocument,
): SelectionContext {
  const bodies = new Map((document.bodies ?? []).map((body) => [body.id, body]));
  const ordered = [...new Map(targets.map((t) => [key(t), t])).values()];
  const faces = new Map<string, FaceTarget>();
  const edges: EdgeTarget[] = [];
  let valid = true;
  for (const target of ordered) {
    if (target.kind === "sketch" || target.kind === "profile") {
      valid &&= document.sketches.some((s) => s.id === target.sketch);
      continue;
    }
    const body = bodies.get(target.body);
    if (!body) {
      valid = false;
      continue;
    }
    if (target.kind === "body") {
      for (const face of body.faces) {
        const t = { kind: "face", body: body.id, face: face.id } as const;
        if (!faces.has(key(t))) faces.set(key(t), t);
      }
    } else if (target.kind === "face") {
      valid &&= body.faces.some((f) => f.id === target.face);
      if (!faces.has(key(target))) faces.set(key(target), target);
    } else {
      valid &&= body.edges.some((e) => e.id === target.edge);
      edges.push(target);
    }
  }
  const bodyOrder = [...new Set(ordered.flatMap((t) => ("body" in t ? [t.body] : [])))];
  const owners = bodyOrder.flatMap((id) => bodies.get(id) ?? []);
  const complete = owners.filter(
    (body) => body.faces.length && body.faces.every((f) => faces.has(`face:${body.id}:${f.id}`)),
  );
  const whole = new Set(complete.map((b) => b.id));
  return {
    ordered,
    faces: [...faces.values()],
    edges,
    owners,
    complete,
    valid,
    partialFaces: [...faces.values()].filter((t) => !whole.has(t.body)),
  };
}

/** Face interpretation for refinement; explicit edges and non-solid targets survive. */
export function expandedSelection(context: SelectionContext): ModelingTarget[] {
  const result: ModelingTarget[] = [];
  const seen = new Set<string>();
  for (const target of context.ordered) {
    const expanded =
      target.kind === "body" ? context.faces.filter((f) => f.body === target.body) : [target];
    for (const t of expanded)
      if (!seen.has(key(t))) {
        seen.add(key(t));
        result.push(t);
      }
  }
  return result;
}
