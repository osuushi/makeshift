import { entityRows } from "../model/entity-presentation.js";
import type { SketchDocument } from "../sketch/document.js";
import type { DecoratorPreset } from "./presets.js";
import type { DecoratorInstance, FaceReference } from "./types.js";

/** Exact settings identify computed presets; names and support membership can change freely. */
export function ephemeralPresetId(instance: DecoratorInstance): string | undefined {
  if (instance.presetOrigin === undefined) return undefined;
  return `ephemeral:${JSON.stringify([
    instance.definition,
    instance.version,
    instance.presetOrigin,
    Object.keys(instance.settings)
      .sort()
      .map((key) => [key, instance.settings[key]]),
  ])}`;
}

/** Only named snapshots are stored separately; unnamed presets exist through their supports. */
export function documentPresets(document: SketchDocument): DecoratorPreset[] {
  const groups = new Map<
    string,
    { instance: DecoratorInstance; faces: Map<string, FaceReference> }
  >();
  for (const instance of document.decorators ?? []) {
    const id = ephemeralPresetId(instance);
    if (!id) continue;
    const group = groups.get(id) ?? { instance, faces: new Map<string, FaceReference>() };
    for (const face of instance.faces)
      if (
        document.bodies?.some((b) => b.id === face.body && b.faces.some((f) => f.id === face.face))
      )
        group.faces.set(`${face.body}/${face.face}`, face);
    groups.set(id, group);
  }
  const presets = [...(document.decoratorPresets ?? [])];
  for (const [id, { instance, faces }] of groups) {
    if (!faces.size) continue;
    const origin = instance.presetOrigin as string;
    presets.push({
      id,
      name: `${origin.slice(0, 96)} [${supportName(document, [...faces.values()]).slice(0, 100)}]`,
      origin,
      definition: instance.definition,
      version: instance.version,
      settings: { ...instance.settings },
    });
  }
  return presets;
}

function supportName(document: SketchDocument, faces: FaceReference[]): string {
  const tags: string[] = [];
  for (const face of faces)
    for (const tag of document.taggedGroups ?? [])
      if (
        tag.body === face.body &&
        tag.members.some((member) => member.kind === "face" && member.id === face.face)
      )
        tags.push(tag.name);
  if (tags.length) return modalName(tags);
  const bodies = entityRows(
    document,
    (document.bodies ?? []).map((b) => b.id),
    "Body",
  );
  return modalName(faces.map((face) => bodies.find((b) => b.id === face.body)?.name ?? "Body"));
}

function modalName(names: string[]): string {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
}
