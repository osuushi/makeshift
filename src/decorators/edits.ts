import type { DisplayDocument } from "../model/display-document.js";
import { newId, type SketchDocument } from "../sketch/document.js";
import { validateFrame } from "../sketch/planes.js";
import { isBuiltinDecorator, knurlDefinition } from "./builtins.js";
import { cylinderExtent, cylinderFrame, resolveFaces, sameCylinder } from "./cylinder.js";
import { gearDefinition, gearSettings } from "./gear-settings.js";
import { knurlSettings, patchKnurlSettings } from "./knurl-settings.js";
import { threadReference, validateAxialReference } from "./thread-extent.js";
import {
  patchThreadSettings,
  threadDefaults,
  threadDefinition,
  threadDepth,
  threadSettings,
} from "./thread-settings.js";
import type { DecoratorEdit, DecoratorInstance, FaceReference } from "./types.js";

export const faceKey = (face: FaceReference) => `${face.body}/${face.face}`;

export function partitionThreads(document: DisplayDocument, refs: readonly FaceReference[]) {
  const faces = resolveFaces(document.bodies ?? [], refs);
  const groups: FaceReference[][] = [];
  for (const [index, ref] of refs.entries()) {
    const cylinder = faces[index].cylinder;
    if (!cylinder) throw new Error("Select cylindrical faces");
    const group = groups.find(
      (g) =>
        g[0].body === ref.body &&
        sameCylinder(cylinder, faces[refs.findIndex((r) => faceKey(r) === faceKey(g[0]))].cylinder),
    );
    if (group) group.push(ref);
    else groups.push([ref]);
  }
  return groups;
}

export function validateThread(document: DisplayDocument, instance: DecoratorInstance): void {
  const settings = threadSettings(instance.settings);
  const faces = resolveFaces(document.bodies ?? [], instance.faces);
  if (partitionThreads(document, instance.faces).length !== 1)
    throw new Error("These faces cannot continue the same threads");
  const [low, high] = threadReference(document.bodies ?? [], instance);
  if (settings.start + settings.end >= high - low - 1e-7)
    throw new Error("Thread insets leave no threaded length");
  const needed =
    settings.profile === "triangle" ? threadDepth(settings) + 0.02 : settings.pitch * 0.62;
  if (needed >= faces[0].cylinder.radius)
    throw new Error("Thread profile is too deep for this cylinder");
}

export function validateBuiltin(document: DisplayDocument, instance: DecoratorInstance): void {
  if (instance.version !== 1) throw new Error("Unsupported decorator version");
  if (instance.definition === threadDefinition) {
    validateThread(document, instance);
    return;
  }
  if (instance.definition !== knurlDefinition)
    throw new Error("Decorator definition is unavailable");
  const settings = knurlSettings(instance.settings);
  const faces = resolveFaces(document.bodies ?? [], instance.faces);
  if (partitionThreads(document, instance.faces).length !== 1)
    throw new Error("These faces cannot continue the same knurling");
  if (settings.depth + 0.02 >= faces[0].cylinder.radius)
    throw new Error("Knurl depth is too large for this cylinder");
}

/** Only geometry-validation failures can be repaired by changing settings alone. */
export function hasSettingsProblem(
  document: DisplayDocument,
  instance: DecoratorInstance,
): boolean {
  if (!instance.problem || !isBuiltinDecorator(instance.definition)) return false;
  if (
    ![
      "Thread profile is too deep for this cylinder",
      "Thread insets leave no threaded length",
      "Knurl depth is too large for this cylinder",
    ].includes(instance.problem)
  )
    return false;
  try {
    validateBuiltin(document, instance);
  } catch (error) {
    return error instanceof Error && error.message === instance.problem;
  }
  return false;
}

function validateReferences(refs: readonly FaceReference[]): void {
  if (
    !Array.isArray(refs) ||
    !refs.length ||
    refs.some((ref) => !ref || typeof ref.body !== "string" || typeof ref.face !== "string")
  )
    throw new Error("Select existing faces");
  if (new Set(refs.map(faceKey)).size !== refs.length) throw new Error("Select each face once");
}

export function validateDecorators(document: SketchDocument): void {
  const instances = document.decorators;
  if (instances === undefined) return;
  if (!Array.isArray(instances)) throw new Error("Invalid decorators");
  const ids = new Set<string>(),
    members = new Set<string>();
  for (const instance of instances) {
    if (
      !instance ||
      typeof instance.id !== "string" ||
      !instance.id ||
      ids.has(instance.id) ||
      typeof instance.definition !== "string" ||
      !Number.isInteger(instance.version) ||
      !instance.settings ||
      typeof instance.settings !== "object" ||
      (instance.problem !== undefined && typeof instance.problem !== "string")
    )
      throw new Error("Invalid decorator instance");
    ids.add(instance.id);
    validateReferences(instance.faces);
    validateFrame(instance.frame);
    validateAxialReference(instance);
    for (const ref of instance.faces) {
      const key = faceKey(ref);
      if (!instance.problem) {
        if (members.has(key)) throw new Error("A face can have only one decorator");
        members.add(key);
      }
    }
    if (instance.definition === threadDefinition) threadSettings(instance.settings);
    if (instance.definition === gearDefinition) gearSettings(instance.settings);
    if (instance.definition === knurlDefinition) knurlSettings(instance.settings);
  }
}

/** Infer settings and members for a local editor; this does not validate acceptance. */
export function prepareBuiltinApplication(
  document: SketchDocument,
  edit: Extract<DecoratorEdit, { action: "apply" }>,
): readonly DecoratorInstance[] {
  const previous = document.decorators ?? [];
  if (!isBuiltinDecorator(edit.definition)) throw new Error("Decorator definition is unavailable");
  if (edit.version !== undefined && edit.version !== 1)
    throw new Error("Unsupported decorator version");
  validateReferences(edit.faces);
  resolveFaces(document.bodies ?? [], edit.faces);
  const occupied = new Map(
    previous.filter((d) => !d.problem).flatMap((d) => d.faces.map((f) => [faceKey(f), d] as const)),
  );
  if (
    edit.faces.some(
      (f) => occupied.has(faceKey(f)) && occupied.get(faceKey(f))?.definition !== edit.definition,
    )
  )
    throw new Error("Remove the existing decorator before applying another");
  const fresh = edit.faces.filter((f) => !occupied.has(faceKey(f)));
  if (!fresh.length) return previous;
  const added = partitionThreads(document, fresh).map((faces): DecoratorInstance => {
    const cylinder = resolveFaces(document.bodies ?? [], faces)[0].cylinder;
    return {
      id: newId(),
      definition: edit.definition,
      version: 1,
      faces,
      frame: cylinderFrame(cylinder),
      settings:
        edit.definition === knurlDefinition
          ? patchKnurlSettings({}, edit.settings ?? {})
          : patchThreadSettings(
              cylinder.radius * 2,
              threadDefaults(cylinder.radius * 2),
              edit.settings ?? {},
            ),
    };
  });
  return [...previous, ...added];
}

function continueBuiltin(
  document: SketchDocument,
  edit: Extract<DecoratorEdit, { action: "continue" | "reassign" }>,
): readonly DecoratorInstance[] {
  const previous = document.decorators ?? [];
  validateReferences(edit.faces);
  const original = previous.find((d) => d.id === edit.id);
  if (!original) throw new Error("Select the decorator to continue");
  const keys = new Set(edit.faces.map(faceKey));
  if (
    previous.some(
      (d) => !d.problem && d.id !== edit.id && d.faces.some((f) => keys.has(faceKey(f))),
    )
  )
    throw new Error("A selected face already has another decoration");
  const faces =
    edit.action === "reassign"
      ? edit.faces
      : [
          ...original.faces,
          ...edit.faces.filter((f) => !original.faces.some((old) => faceKey(old) === faceKey(f))),
        ];
  const cylinder = resolveFaces(document.bodies ?? [], faces)[0].cylinder;
  const reference = original.axialReference;
  const extent =
    edit.action === "continue" && reference
      ? cylinderExtent(original.frame, resolveFaces(document.bodies ?? [], faces))
      : [0, 0];
  const updated = {
    ...original,
    faces,
    problem: undefined,
    axialReference:
      edit.action === "reassign" || !reference
        ? undefined
        : ([Math.min(reference[0], extent[0]), Math.max(reference[1], extent[1])] as [
            number,
            number,
          ]),
    frame: edit.action === "reassign" ? cylinderFrame(cylinder) : original.frame,
  };
  validateBuiltin(document, updated);
  return previous.map((d) => (d.id === edit.id ? updated : d));
}

export function editDecorators(document: SketchDocument, edit: DecoratorEdit): SketchDocument {
  const previous = document.decorators ?? [];
  let next: readonly DecoratorInstance[] = previous;
  if (edit.action === "apply") {
    next = prepareBuiltinApplication(document, edit);
    for (const instance of next) {
      if (!previous.includes(instance)) validateBuiltin(document, instance);
    }
  } else if (edit.action === "settings") {
    if (!edit.ids.length || edit.ids.some((id) => !previous.some((d) => d.id === id)))
      throw new Error("Select existing decorators");
    next = previous.map((instance) => {
      if (!edit.ids.includes(instance.id)) return instance;
      if (!isBuiltinDecorator(instance.definition))
        throw new Error("Decorator definition is unavailable");
      const radius = resolveFaces(document.bodies ?? [], instance.faces)[0].cylinder.radius;
      const updated = {
        ...instance,
        problem: hasSettingsProblem(document, instance) ? undefined : instance.problem,
        settings:
          instance.definition === knurlDefinition
            ? patchKnurlSettings(instance.settings, edit.patch)
            : patchThreadSettings(radius * 2, instance.settings, edit.patch),
      };
      validateBuiltin(document, updated);
      return updated;
    });
  } else if (edit.action === "continue" || edit.action === "reassign") {
    next = continueBuiltin(document, edit);
  } else if (edit.action === "discard") {
    if (!previous.some((d) => d.id === edit.id)) throw new Error("Select an existing decorator");
    next = previous.filter((d) => d.id !== edit.id);
  } else if (edit.action === "remove") {
    validateReferences(edit.faces);
    const keys = new Set(edit.faces.map(faceKey));
    next = previous
      .map((d) => ({
        ...d,
        axialReference:
          !d.problem &&
          d.definition === threadDefinition &&
          d.faces.some((f) => keys.has(faceKey(f)))
            ? threadReference(document.bodies ?? [], d)
            : d.axialReference,
        faces: d.faces.filter((f) => !keys.has(faceKey(f))),
      }))
      .filter((d) => d.faces.length);
  } else throw new Error("Unknown decorator edit");
  const candidate = { ...document, decorators: next };
  validateDecorators(candidate);
  return candidate;
}
