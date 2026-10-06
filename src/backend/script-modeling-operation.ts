import type { ScriptOperation, ScriptResult } from "../agent-script/api.js";
import { withConstructionPlane } from "../model/construction-plane.js";
import { newId, type SketchDocument } from "../sketch/document.js";
import { profilesFor } from "../sketch/profiles.js";
import { cutWithPlane } from "./plane-cut.js";
import { scaleDocument } from "./scale.js";
import type { SolidCalculator } from "./solid-calculator.js";

type Operation = Extract<
  ScriptOperation,
  {
    kind: "constructionPlane" | "deleteConstructionPlane" | "splitBody" | "imprint" | "scale";
  }
>;
/** Same document edits as manual tools, evaluated within the script candidate. */
export async function scriptModelingOperation(
  document: SketchDocument,
  operation: Operation,
  kernel: SolidCalculator,
): Promise<{ document: SketchDocument; result: ScriptResult }> {
  if (operation.kind === "constructionPlane" || operation.kind === "deleteConstructionPlane") {
    const id = operation.input.id;
    if (
      (id !== undefined || operation.kind === "deleteConstructionPlane") &&
      !document.constructionPlanes?.some((p) => p.id === id)
    )
      throw new Error("Unknown construction plane");
    if (operation.kind === "deleteConstructionPlane")
      return {
        document: {
          ...document,
          constructionPlanes: document.constructionPlanes?.filter((p) => p.id !== id),
        },
        result: { removed: operation.input.id },
      };
    const plane = { id: id ?? newId(), frame: structuredClone(operation.input.frame) };
    return {
      document: withConstructionPlane(document, plane),
      result: { plane: plane.id, frame: plane.frame },
    };
  }
  let next: SketchDocument;
  if (operation.kind === "scale") {
    const o = operation.input;
    if (
      !Array.isArray(o.ids) ||
      o.ids.length > 1000 ||
      (o.kind === "solids" &&
        (!Array.isArray(o.faces) ||
          !Array.isArray(o.edges) ||
          o.faces.length + o.edges.length > 1000 ||
          [...o.faces, ...o.edges].some((t) => !t)))
    )
      throw new Error("Invalid script scale targets");
    next = await scaleDocument(document, o, kernel);
  } else {
    const { targets, frame, surface } = operation.input;
    validateCut(document, operation);
    next = await cutWithPlane(
      document,
      { targets, frame, surface, mode: operation.kind === "splitBody" ? "split" : "imprint" },
      kernel,
    );
  }
  return {
    document: next,
    result: {
      bodies: (next.bodies ?? []).map((b) => ({
        id: b.id,
        volume: b.volume,
        faces: b.faces.map((f) => f.id),
        edges: b.edges.map((e) => e.id),
      })),
      ...(operation.kind === "scale"
        ? {
            sketches: next.sketches.map((s) => ({
              sketch: s.id,
              curves: s.curves.map((c) => c.id),
              profiles: profilesFor(s).map((p) => ({ sketch: s.id, profile: p.key })),
            })),
          }
        : {}),
    },
  };
}

function validateCut(
  document: SketchDocument,
  operation: Extract<Operation, { kind: "splitBody" | "imprint" }>,
): void {
  const { targets } = operation.input;
  if (
    !Array.isArray(targets) ||
    !targets.length ||
    targets.length > 1000 ||
    new Set(targets.map((t) => t?.body)).size !== targets.length
  )
    throw new Error("Select each cut body once");
  for (const target of targets) {
    const body = document.bodies?.find((b) => b.id === target?.body);
    if (!body) throw new Error("Unknown plane-cut body");
    if (operation.kind === "imprint" && (!Array.isArray(target.faces) || !target.faces.length))
      throw new Error("Imprint requires explicit faces");
    if (
      target.faces !== undefined &&
      (!Array.isArray(target.faces) ||
        !target.faces.length ||
        new Set(target.faces).size !== target.faces.length ||
        target.faces.some((id) => !body.faces.some((f) => f.id === id)))
    )
      throw new Error("Unknown or duplicate plane-cut face");
  }
}
