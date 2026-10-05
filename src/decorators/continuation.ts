import type { BodyGeometry } from "../model/body.js";
import { topologyOrigins } from "../model/body-correspondence.js";
import type { DisplayDocument } from "../model/display-document.js";
import { newId, type SketchDocument } from "../sketch/document.js";
import type { ModelRequest } from "../sketch/model-api.js";
import { isBuiltinDecorator } from "./builtins.js";
import { pendingCustomContinuation } from "./custom-continuation.js";
import { cross, sameCylinder, subtract } from "./cylinder.js";
import { hasSettingsProblem, validateBuiltin } from "./edits.js";
import { threadReference } from "./thread-extent.js";
import { threadDefinition } from "./thread-settings.js";
import { transformedAxialReference, transformedThreadFrame } from "./transform-frame.js";
import type { DecoratorInstance } from "./types.js";

function descendants(
  instance: DecoratorInstance,
  source: SketchDocument,
  body: BodyGeometry,
  request?: ModelRequest,
) {
  const oldFaces = new Set(instance.faces.map((f) => f.face));
  const original = source.bodies?.find((b) => b.id === body.id);
  const unchanged = original === body;
  const origins = unchanged ? undefined : topologyOrigins.get(body);
  const faces = body.faces.filter(
    (face) => oldFaces.has(face.id) || origins?.faces.get(face.id)?.some((id) => oldFaces.has(id)),
  );
  if (!faces.length) return null;
  const frame = unchanged ? instance.frame : transformedThreadFrame(instance, request);
  let problem = hasSettingsProblem(instance) ? undefined : instance.problem;
  if (faces.some((face) => origins?.faces.get(face.id)?.some((id) => !oldFaces.has(id))))
    problem = "A face merged with other geometry. Reassign the decoration to the intended faces.";
  if (!isBuiltinDecorator(instance.definition)) {
    return {
      ...instance,
      frame,
      ...(instance.axialReference && !unchanged
        ? { axialReference: transformedAxialReference(instance, request) }
        : {}),
      problem,
      faces: faces.map((f) => ({ body: body.id, face: f.id })),
    };
  }
  const cylinder = faces[0].cylinder;
  const originalSide = source.bodies?.flatMap((b) => b.faces).find((f) => oldFaces.has(f.id))
    ?.cylinder?.outward;
  if (!cylinder || faces.some((f) => !f.cylinder || !sameCylinder(cylinder, f.cylinder)))
    problem =
      "These faces no longer form one cylindrical support. Reassign or remove the decoration.";
  else if (originalSide !== cylinder.outward)
    problem = "The decoration changed between an outer and inner surface. Reassign or remove it.";
  else {
    const axis = cross(frame.u, frame.v);
    if (
      Math.hypot(...cross(axis, cylinder.axis)) > 1e-7 ||
      Math.hypot(...cross(subtract(frame.origin, cylinder.origin), axis)) > 1e-7
    )
      problem = "The cylindrical support moved independently. Reassign the decoration.";
  }
  return {
    ...instance,
    frame,
    problem,
    axialReference: unchanged
      ? instance.axialReference
      : transformedAxialReference(instance, request),
    faces: faces.map((f) => ({ body: body.id, face: f.id })),
  };
}

/** Consume immediate topology correspondence during the geometry edit, never replay old operations. */
export function continueDecorators<Document extends DisplayDocument>(
  source: SketchDocument,
  candidate: Document,
  request?: ModelRequest,
): Document {
  if (!source.decorators?.length || source.bodies === candidate.bodies) return candidate;
  const decorators: DecoratorInstance[] = [];
  for (const instance of source.decorators) {
    const split =
      (candidate.bodies ?? []).filter((b) => {
        const origins = topologyOrigins.get(b);
        return (
          !origins?.copy &&
          source.bodies?.every((old) => old !== b) &&
          origins?.bodies.includes(instance.faces[0].body)
        );
      }).length > 1;
    const reference =
      split && !instance.problem && instance.definition === threadDefinition
        ? { ...instance, axialReference: threadReference(source.bodies ?? [], instance) }
        : instance;
    let count = 0;
    for (const body of candidate.bodies ?? []) {
      const next = descendants(reference, source, body, request);
      if (!next) continue;
      let updated = { ...next, id: count++ === 0 ? instance.id : newId() };
      if (
        !isBuiltinDecorator(instance.definition) &&
        !updated.problem &&
        !source.bodies?.some((original) => original === body)
      )
        pendingCustomContinuation.add(updated);
      if (isBuiltinDecorator(instance.definition) && !updated.problem) {
        try {
          validateBuiltin(candidate, updated);
        } catch (error) {
          updated = { ...updated, problem: error instanceof Error ? error.message : String(error) };
        }
      }
      decorators.push(updated);
    }
    if (!count) {
      const survivor = candidate.bodies?.find((b) =>
        instance.faces.some(
          (f) => b.id === f.body || topologyOrigins.get(b)?.bodies.includes(f.body),
        ),
      );
      if (survivor)
        decorators.push({
          ...instance,
          faces: instance.faces.map((f) => ({ ...f, body: survivor.id })),
          problem: "The decorated faces were removed. Reassign or remove the decoration.",
        });
    }
  }
  return { ...candidate, decorators };
}
