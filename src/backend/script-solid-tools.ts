import type { ScriptOperation } from "../agent-script/api.js";
import type { SketchDocument } from "../sketch/document.js";
import type { SolidEdits } from "./solid-edits.js";

type Operation = Extract<
  ScriptOperation,
  { kind: "booleanBodies" | "finishEdges" | "shell" | "erode" }
>;
/** Script entry points share manual solid calculations, while requiring exact typed sizes. */
export async function scriptSolidTool(
  document: SketchDocument,
  operation: Operation,
  solids: SolidEdits,
): Promise<SketchDocument> {
  validate(document, operation);
  if (operation.kind === "booleanBodies")
    return solids.calculate(document, { kind: "boolean-bodies", operation: operation.input });
  if (operation.kind === "shell")
    return solids.calculate(document, { kind: "shell", operation: operation.input });
  if (operation.kind === "erode")
    return solids.calculate(document, { kind: "erode", operation: operation.input });
  const next = await solids.calculate(document, {
    kind: "finish-edges",
    operation: operation.input,
  });
  if (solids.edgeSize !== operation.input.size)
    throw new Error("Requested edge size could not be achieved exactly");
  return next;
}
function validate(document: SketchDocument, operation: Operation): void {
  const bodies = document.bodies ?? [];
  if (operation.kind === "booleanBodies") {
    const { ids, mode, keepOriginals, experimentalTrimFiltering } = operation.input;
    if (
      !uniqueStrings(ids) ||
      ids.length < 2 ||
      !["union", "subtract", "intersect"].includes(mode) ||
      typeof keepOriginals !== "boolean" ||
      (experimentalTrimFiltering !== undefined && typeof experimentalTrimFiltering !== "boolean") ||
      ids.some((id) => !bodies.some((b) => b.id === id))
    )
      throw new Error(
        "Boolean requires ordered distinct existing bodies and an explicit mode/keepOriginals",
      );
  } else if (operation.kind === "erode") {
    const { ids, thickness, allowance = 0, keepOriginals, method } = operation.input;
    if (method !== undefined && method !== "fast" && method !== "accurate")
      throw new Error("Choose Remesh or Analytic erosion");
    if (
      !uniqueStrings(ids) ||
      !ids.length ||
      ids.some((id) => !bodies.some((body) => body.id === id)) ||
      !Number.isFinite(thickness) ||
      thickness <= 1e-5 ||
      (method === "accurate" && (!Number.isFinite(allowance) || allowance < 0)) ||
      (keepOriginals !== undefined && typeof keepOriginals !== "boolean")
    )
      throw new Error(
        "Erode requires distinct existing bodies, positive thickness and nonnegative extra allowance",
      );
  } else if (operation.kind === "finishEdges") {
    const { edges, mode, size } = operation.input;
    if (
      !Number.isFinite(size) ||
      size < 0 ||
      !["fillet", "chamfer"].includes(mode) ||
      !Array.isArray(edges) ||
      !edges.length ||
      edges.length > 1000
    )
      throw new Error("Invalid edge finish: choose edges, mode and a nonnegative finite size");
    const keys = new Set<string>();
    for (const target of edges) {
      if (
        !target ||
        !bodies.find((b) => b.id === target.body)?.edges.some((e) => e.id === target.edge)
      )
        throw new Error("Unknown edge finish target");
      const key = `${target.body}/${target.edge}`;
      if (keys.has(key)) throw new Error("Select each finish edge once");
      keys.add(key);
    }
  } else {
    const { selection, thickness } = operation.input;
    if (
      !Number.isFinite(thickness) ||
      !Array.isArray(selection) ||
      !selection.length ||
      selection.length > 1000
    )
      throw new Error("Shell requires a finite thickness and explicit body/opening selection");
    const ids = new Set<string>();
    for (const target of selection) {
      const body = bodies.find((b) => b.id === target?.body);
      if (
        !body ||
        !uniqueStrings(target.faces) ||
        target.faces.some((id) => !body.faces.some((f) => f.id === id))
      )
        throw new Error("Unknown or duplicate shell opening face");
      if (ids.has(body.id)) throw new Error("Select each shell body once");
      ids.add(body.id);
    }
  }
}
function uniqueStrings(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 1000 &&
    value.every((id) => typeof id === "string") &&
    new Set(value).size === value.length
  );
}
