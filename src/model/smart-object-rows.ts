import type { SketchDocument } from "../sketch/document.js";
import type { BenchTab } from "./benches.js";
import { entityRows } from "./entity-presentation.js";

export function smartObjectRows(data: SketchDocument, tabs: readonly BenchTab[]) {
  const objects = data.smartObjects ?? [];
  const groups = new Map<string, string[]>();
  const byId = new Map(objects.map((object) => [object.id, object]));
  for (const { id, source } of objects) {
    const group = groups.get(source) ?? [];
    group.push(id);
    groups.set(source, group);
  }
  return entityRows(
    data,
    objects.map(({ id }) => id),
    "Smart object",
  ).map(({ id, name }) => {
    const object = byId.get(id);
    const source = tabs.find((tab) => tab.id === object?.source)?.name ?? name;
    const siblings = object && groups.get(object.source);
    const label =
      siblings && siblings.length > 1 ? `${source} · ${siblings.indexOf(id) + 1}` : source;
    return { id, name: data.entityPresentation?.find((entity) => entity.id === id)?.name ?? label };
  });
}
