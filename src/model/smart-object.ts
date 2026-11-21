import type { SketchDocument } from "../sketch/document.js";
import { type Affine, composeAffine, identityAffine, requireAffine } from "./affine.js";
import type { Drawing } from "./benches.js";
import type { DisplayDocument } from "./display-document.js";

export interface SmartObject {
  readonly id: string;
  readonly source: string;
  readonly transform: Affine;
}

export interface SmartObjectTransform {
  ids: readonly string[];
  transform: Affine;
  absolute?: boolean;
  duplicate?: boolean;
}

export type SmartObjectEdit =
  | { action: "insert"; source: string }
  | ({ action: "transform" } & SmartObjectTransform)
  | { action: "detach"; ids: string[] }
  | { action: "convert"; selection: SmartObjectSelection }
  | { action: "enter" | "source"; id: string }
  | { action: "exit" };

export interface SmartObjectSelection {
  bodies: string[];
  sketches: string[];
  instances: string[];
  planes?: string[];
  curves?: { sketch: string; ids: string[] }[];
  profiles?: { sketch: string; profile: string }[];
}

export type LinkedBench = Pick<
  DisplayDocument,
  "bodies" | "sketches" | "bodyAppearances" | "smartObjects"
>;
export interface InlineLink {
  readonly parent: string;
  readonly placement: SmartObject;
}
export interface BenchFocus {
  readonly active: string;
  readonly inline: readonly InlineLink[];
}
export function benchFocusKey(focus: BenchFocus): string {
  return JSON.stringify([focus.active, ...focus.inline.map(({ placement }) => placement.id)]);
}
export interface ResolvedPlacement {
  readonly root: string;
  readonly path: readonly string[];
  readonly source: string;
  readonly transform: Affine;
}

/** An iterative walk lets many benches share the same source without revisiting their links. */
export function validateSmartLinks(drawing: Drawing): void {
  const sources = new Map(
    drawing.benches.map(({ id, document }) => [id, document.smartObjects ?? []]),
  );
  const finished = new Set<string>();
  for (const id of sources.keys()) {
    if (finished.has(id)) continue;
    const visiting = new Set<string>();
    const stack = [{ id, index: 0 }];
    visiting.add(id);
    while (stack.length) {
      const node = stack[stack.length - 1];
      const item = sources.get(node.id)?.[node.index++];
      if (!item) {
        visiting.delete(node.id);
        finished.add(node.id);
        stack.pop();
        continue;
      }
      if (!sources.has(item.source)) throw new Error("The smart object's source bench is missing");
      if (visiting.has(item.source))
        throw new Error("Smart objects cannot link back to their own bench");
      if (finished.has(item.source)) continue;
      visiting.add(item.source);
      stack.push({ id: item.source, index: 0 });
    }
  }
}

/** Expand scene placement paths while keeping source geometry shared per bench. */
export function* resolvePlacements(
  objects: readonly SmartObject[],
  lookup: (id: string) => Pick<LinkedBench, "smartObjects"> | undefined,
  base = identityAffine,
): Generator<ResolvedPlacement> {
  const pending = [...objects].reverse().map((object) => ({
    root: object.id,
    path: [object.id],
    source: object.source,
    transform: composeAffine(base, object.transform),
  }));
  while (pending.length) {
    const placement = pending.pop();
    if (!placement) break;
    const source = lookup(placement.source);
    if (!source) continue;
    yield placement;
    for (const child of [...(source.smartObjects ?? [])].reverse()) {
      pending.push({
        root: placement.root,
        path: [...placement.path, child.id],
        source: child.source,
        transform: composeAffine(placement.transform, child.transform),
      });
    }
  }
}

export function validateSmartObject(object: SmartObject): void {
  if (!object || typeof object.source !== "string" || !object.source)
    throw new Error("Invalid smart object source bench");
  requireAffine(object.transform);
}

export function transformSmartObjects<D extends Pick<SketchDocument, "smartObjects">>(
  document: D,
  edit: SmartObjectTransform,
  copyId: (id: string) => string,
): D {
  requireAffine(edit.transform);
  if (!edit.ids.length) throw new Error("Select smart objects to transform");
  const objects = document.smartObjects ?? [];
  const byId = new Map(objects.map((object) => [object.id, object]));
  const transformed = new Map<string, SmartObject>();
  for (const id of new Set(edit.ids)) {
    const object = byId.get(id);
    if (!object) throw new Error("A selected smart object no longer exists");
    const transform = edit.absolute
      ? edit.transform
      : composeAffine(edit.transform, object.transform);
    requireAffine(transform);
    transformed.set(id, { ...object, transform, id: edit.duplicate ? copyId(id) : id });
  }
  return {
    ...document,
    smartObjects: edit.duplicate
      ? [...objects, ...transformed.values()]
      : objects.map((object) => transformed.get(object.id) ?? object),
  };
}
