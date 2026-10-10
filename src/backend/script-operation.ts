import type { ScriptOperation, ScriptResult } from "../agent-script/api.js";
import { emptySketch, newId, type SketchDocument, withSketch } from "../sketch/document.js";
import { planes, validateFrame } from "../sketch/planes.js";
import { profilesFor } from "../sketch/profiles.js";
import { editTags } from "../tags/model.js";
import { continueBodyMetadata } from "./body-metadata.js";
import { pathSweepInput } from "./kernel-input.js";
import { materialize } from "./kernel-result.js";
import type { NativeSolver } from "./native-solver.js";
import { scriptMeshFit } from "./script-mesh-fit.js";
import { scriptModelingOperation } from "./script-modeling-operation.js";
import { scriptSolidTool } from "./script-solid-tools.js";
import { resolveTagOperation } from "./script-tags.js";
import { scriptTopology } from "./script-topology.js";
import { validateScriptSolid } from "./script-validation.js";
import type { SolidCalculator } from "./solid-calculator.js";
import type { SolidEdits } from "./solid-edits.js";
import { solveSketch } from "./solve-sketch.js";

/** Validate the public operation before it reaches the shared solver/kernel. */
export async function scriptOperation(
  document: SketchDocument,
  operation: Exclude<
    ScriptOperation,
    import("../agent-script/decorators.js").DecoratorScriptOperation
  >,
  solids: SolidEdits,
  solver: NativeSolver,
  kernel: SolidCalculator,
): Promise<{ document: SketchDocument; result: ScriptResult }> {
  if (!operation || typeof operation !== "object" || !operation.input)
    throw new Error("Invalid script operation");
  if (operation.kind === "fitMesh") return scriptMeshFit(document, operation.input, kernel);
  if (operation.kind === "centerOfMass") {
    const body = document.bodies?.find((body) => body.id === operation.input.body);
    if (!body) throw new Error("Unknown center-of-mass body");
    return { document, result: { centerOfMass: await kernel.centerOfMass(body) } };
  }
  if (operation.kind === "taggedGroups") return { document, result: document.taggedGroups ?? [] };
  if (operation.kind === "editTaggedGroup") {
    const next = editTags(document, operation.input);
    return { document: next, result: next.taggedGroups ?? [] };
  }
  if (operation.kind === "applyTaggedGroup") {
    const resolved = resolveTagOperation(document, operation.input);
    return scriptOperation(document, resolved, solids, solver, kernel);
  }
  if (operation.kind === "topology" || operation.kind === "replaceFace")
    return scriptTopology(document, operation, kernel);
  if (operation.kind === "createSketch") return createScriptSketch(document, operation, solver);
  if (
    operation.kind === "constructionPlane" ||
    operation.kind === "deleteConstructionPlane" ||
    operation.kind === "splitBody" ||
    operation.kind === "imprint" ||
    operation.kind === "scale"
  )
    return scriptModelingOperation(document, operation, kernel);
  let next: SketchDocument;
  if (
    operation.kind === "booleanBodies" ||
    operation.kind === "finishEdges" ||
    operation.kind === "erode" ||
    operation.kind === "shell"
  ) {
    next = await scriptSolidTool(document, operation, solids);
  } else {
    validateScriptSolid(document, operation);
    next = await calculateScriptSolid(document, operation, solids, kernel);
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
    },
  };
}

async function calculateScriptSolid(
  document: SketchDocument,
  operation: Extract<
    ScriptOperation,
    {
      kind:
        | "sweep"
        | "extrude"
        | "loft"
        | "revolve"
        | "offsetFaces"
        | "moveFaces"
        | "transformBodies";
    }
  >,
  solids: SolidEdits,
  kernel: SolidCalculator,
): Promise<SketchDocument> {
  let next: SketchDocument;
  if (operation.kind === "sweep") {
    const bodies = document.bodies ?? [];
    const result = await kernel.calculate(pathSweepInput(document, operation.input, bodies));
    next = continueBodyMetadata(document, { ...document, bodies: materialize(bodies, result) });
  } else if (operation.kind === "extrude") {
    const e = operation.input;
    next = await solids.calculate(document, { kind: "extrude", extrusion: e });
  } else if (operation.kind === "loft") {
    next = await solids.calculate(document, { kind: "loft", operation: operation.input });
  } else if (operation.kind === "revolve") {
    next = await solids.calculate(document, { kind: "revolve", revolution: operation.input });
  } else if (operation.kind === "offsetFaces") {
    const o = operation.input;
    next = await solids.calculate(document, { kind: "offset-faces", operation: o });
    if (solids.offsetEdit.view.offsetDistance !== o.distance)
      throw new Error("Requested offset could not be achieved exactly");
  } else if (operation.kind === "moveFaces") {
    next = await solids.calculate(document, { kind: "move-faces", operation: operation.input });
  } else if (operation.kind === "transformBodies") {
    const t = operation.input;
    next = await solids.calculate(document, { kind: "transform-bodies", transform: t });
  } else throw new Error("Unknown script operation");
  return next;
}

async function createScriptSketch(
  document: SketchDocument,
  operation: Extract<ScriptOperation, { kind: "createSketch" }>,
  solver: NativeSolver,
): Promise<{ document: SketchDocument; result: ScriptResult }> {
  const { plane, curves } = operation.input;
  const frame = typeof plane === "string" ? planes[plane] : plane;
  if (!frame || !Array.isArray(curves) || !curves.length || curves.length > 1000)
    throw new Error("A script sketch requires a plane and 1–1000 curves");
  validateFrame(frame);
  const sketch = {
    ...emptySketch(frame),
    curves: curves.map((curve) => ({ ...curve, id: newId(), construction: false })),
  };
  const solved = await solveSketch(sketch, undefined, solver, true, { kind: "direct" });
  return {
    document: withSketch(document, solved.sketch),
    result: {
      sketch: sketch.id,
      curves: sketch.curves.map((c) => c.id),
      profiles: profilesFor(solved.sketch).map((p) => ({ sketch: sketch.id, profile: p.key })),
    },
  };
}
