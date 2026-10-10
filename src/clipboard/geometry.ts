import type { ExactBody } from "../model/exact-body.js";
import { appendSelection, copySketch } from "../sketch/copy-selection.js";
import { newId, type Sketch, type SketchDocument, withSketch } from "../sketch/document.js";
import type { PlaneFrame } from "../sketch/planes.js";

/** Clipboard contains exact geometry, never display tessellation. */
export interface ClipboardGeometry {
  sketches: readonly Sketch[];
  bodies: readonly ExactBody[];
  bodyAppearances?: SketchDocument["bodyAppearances"];
  taggedGroups?: SketchDocument["taggedGroups"];
  entityPresentation?: SketchDocument["entityPresentation"];
  decorators?: SketchDocument["decorators"];
  decoratorDefinitions?: SketchDocument["decoratorDefinitions"];
}
export interface PasteTarget {
  id: string;
  plane: PlaneFrame;
}
export const clipboardFormat = "makeshift-geometry";
const maxLength = 64 * 1024 * 1024;
export function writeClipboard(geometry: ClipboardGeometry): string {
  const text = JSON.stringify({ format: clipboardFormat, version: 1, geometry });
  if (text.length > maxLength) throw new Error("Selection exceeds the 64 MiB clipboard limit");
  return text;
}
export function readClipboard(text: string): ClipboardGeometry {
  if (text.length > maxLength) throw new Error("Clipboard exceeds the 64 MiB limit");
  let value: { format?: string; version?: number; geometry?: ClipboardGeometry };
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Clipboard does not contain Makeshift geometry");
  }
  if (value?.format !== clipboardFormat || value.version !== 1 || !value.geometry)
    throw new Error("Clipboard does not contain supported Makeshift geometry");
  const geometry = value.geometry;
  if (!Array.isArray(geometry.sketches) || !Array.isArray(geometry.bodies))
    throw new Error("Invalid clipboard geometry");
  if (!geometry.sketches.length && !geometry.bodies.length)
    throw new Error("Clipboard contains no geometry");
  // Whitelist supported archive data fields.
  return {
    sketches: geometry.sketches,
    bodies: geometry.bodies,
    bodyAppearances: geometry.bodyAppearances,
    taggedGroups: geometry.taggedGroups,
    entityPresentation: geometry.entityPresentation,
    decorators: geometry.decorators,
    decoratorDefinitions: geometry.decoratorDefinitions,
  };
}

/** Re-key all document and topology identities before kernel inspection. */
export function cloneClipboard(source: ClipboardGeometry): ClipboardGeometry {
  const ids = new Map<string, string>();
  const get = (id: string): string => {
    if (!ids.has(id)) ids.set(id, newId());
    return ids.get(id) as string;
  };
  const sketches = source.sketches.map((sketch) => copySketch(sketch));
  source.sketches.forEach((sketch, index) => {
    ids.set(sketch.id, sketches[index].id);
  });
  const bodies = source.bodies.map((body) => ({
    id: get(body.id),
    brep: body.brep,
    faces: body.faces.map((face) => ({ ...face, id: get(face.id) })),
    edges: body.edges.map((edge) => ({ ...edge, id: get(edge.id) })),
  }));
  const definitions = new Map<string, string>();
  for (const definition of source.decoratorDefinitions ?? [])
    if (!definitions.has(definition.id)) definitions.set(definition.id, `clipboard.${newId()}`);
  return {
    sketches,
    bodies,
    decoratorDefinitions: source.decoratorDefinitions?.map((definition) => ({
      ...definition,
      id: definitions.get(definition.id) as string,
    })),
    decorators: source.decorators?.map((instance) => ({
      ...instance,
      id: get(instance.id),
      definition: definitions.get(instance.definition) ?? instance.definition,
      faces: instance.faces.map((face) => ({ body: get(face.body), face: get(face.face) })),
    })),
    bodyAppearances: source.bodyAppearances?.map((entry) => ({ ...entry, body: get(entry.body) })),
    taggedGroups: source.taggedGroups?.map(({ splitFrom: _splitFrom, ...group }) => ({
      ...group,
      id: get(group.id),
      body: get(group.body),
      members: group.members.map((member) => ({ ...member, id: get(member.id) })),
    })),
    entityPresentation: source.entityPresentation?.map((entry) => ({
      ...entry,
      id: get(entry.id),
    })),
  };
}

export function appendClipboard(
  document: SketchDocument,
  imported: SketchDocument,
  target?: PasteTarget,
): SketchDocument {
  let next = document;
  if (target && imported.sketches.length) {
    let sketch = document.sketches.find((s) => s.id === target.id) ?? {
      ...target,
      curves: [],
      constraints: [],
      groups: [],
    };
    for (const copy of imported.sketches) sketch = appendSelection(sketch, copy);
    next = withSketch(next, sketch);
  } else next = { ...next, sketches: [...next.sketches, ...imported.sketches] };
  const merged = {
    ...next,
    bodies: [...(next.bodies ?? []), ...(imported.bodies ?? [])],
    decorators: [...(next.decorators ?? []), ...(imported.decorators ?? [])],
    decoratorDefinitions: [
      ...(next.decoratorDefinitions ?? []),
      ...(imported.decoratorDefinitions ?? []),
    ],
    bodyAppearances: [...(next.bodyAppearances ?? []), ...(imported.bodyAppearances ?? [])],
    taggedGroups: [...(next.taggedGroups ?? []), ...(imported.taggedGroups ?? [])],
    entityPresentation: [
      ...(next.entityPresentation ?? []),
      ...(imported.entityPresentation ?? []).filter(
        (entry) => !target || !imported.sketches.some((s) => s.id === entry.id),
      ),
    ],
  };
  return merged;
}
