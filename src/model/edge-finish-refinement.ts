import type { SketchDocument } from "../sketch/document.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { ModelingTarget } from "../sketch/model-selection-state.js";
import type { BodyEdgeFinish } from "./body.js";
import { BodyPickProbe } from "./body-picking.js";
import { pickBodyEdge } from "./edge-selection.js";
import { resolveOperation } from "./operation-selection.js";

/** A translated group toggles off only when every member is already selected. */
export function refineFinishEdges(
  document: SketchDocument,
  edges: BodyEdgeFinish["edges"],
  target: ModelingTarget,
  translate: boolean,
  toggle: boolean,
): BodyEdgeFinish["edges"] | null {
  if (target.kind !== "edge" && !(translate && target.kind === "face")) return null;
  const resolved = resolveOperation("fillet", [target], document);
  if (!resolved.available) return null;
  const incoming = resolved.inputs;
  const key = (edge: BodyEdgeFinish["edges"][number]) => `${edge.body}:${edge.edge}`;
  const selected = new Set(edges.map(key));
  const keys = new Set(incoming.map(key));
  return toggle && incoming.every((edge) => selected.has(key(edge)))
    ? edges.filter((edge) => !keys.has(key(edge)))
    : [...edges, ...incoming.filter((edge) => !selected.has(key(edge)))];
}

export function pickFinishTarget(editor: SketchEditor, event: MouseEvent): ModelingTarget | null {
  const screen = { x: event.clientX, y: event.clientY };
  // Preview topology is temporary; tool inputs always refer to accepted geometry.
  const probe = new BodyPickProbe(editor, screen, editor.store.data.bodies);
  const edge = pickBodyEdge(editor, screen, probe);
  if (edge) return { kind: "edge", body: edge.body, edge: edge.edge, point: edge.point };
  const face = probe.faces()[0];
  return face ? { kind: "face", body: face.body, face: face.face } : null;
}
