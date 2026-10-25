import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { continueDecorators } from "../src/decorators/continuation.js";
import { pendingCustomContinuation } from "../src/decorators/custom-continuation.js";
import { geometryDependency } from "../src/decorators/dependencies.js";
import { previewSignatures } from "../src/decorators/preview-signatures.js";
import type { SketchDocument } from "../src/sketch/document.js";

test("plugin dependency declarations opt in independently and preserve source/state invalidation", async () => {
  const fixture: { document: SketchDocument } = JSON.parse(
    await readFile("tests/fixtures/gear-cylinders.json", "utf8"),
  );
  const original = fixture.document.decorators?.[0];
  assert.ok(original);
  const instance = { ...original, definition: "example.scoped" };
  const definition = {
    id: instance.definition,
    version: 1,
    name: "Scoped",
    source: "export default {};",
    fields: [],
    preview: true,
  };
  const source = {
    ...fixture.document,
    decorators: [instance],
    decoratorDefinitions: [definition],
  };
  const renamed = {
    ...source,
    entityPresentation: [{ id: instance.faces[0].body, name: "Changed" }],
  };
  const key = (document: SketchDocument, sources = "[]") =>
    previewSignatures(document, sources).get(instance.id);
  assert.notEqual(key(source), key(renamed), "existing plugins keep conservative defaults");
  const scoped = {
    ...source,
    decoratorDefinitions: [{ ...definition, dependencies: { preview: "faces" as const } }],
  };
  assert.equal(key(scoped), key({ ...renamed, decoratorDefinitions: scoped.decoratorDefinitions }));
  assert.notEqual(key(scoped), key(scoped, "enabled source"));
  assert.notEqual(
    key(scoped),
    key({ ...scoped, decorators: [{ ...instance, state: { changed: true } }] }),
  );
  assert.notEqual(
    key(scoped),
    key({
      ...scoped,
      decoratorDefinitions: [
        { ...scoped.decoratorDefinitions[0], source: "export default {preview(){return null}};" },
      ],
    }),
  );
  const body = source.bodies?.find((b) => b.id === instance.faces[0].body);
  assert.ok(body);
  const changed = { ...body, volume: body.volume + 1 };
  const candidate = { ...scoped, bodies: scoped.bodies?.map((b) => (b === body ? changed : b)) };
  const conservative = continueDecorators(scoped, candidate).decorators?.[0];
  assert.ok(
    conservative && pendingCustomContinuation.has(conservative),
    "preview scope does not narrow continuation",
  );
  const local = {
    ...scoped,
    decoratorDefinitions: [{ ...definition, dependencies: { continuation: "faces" as const } }],
  };
  assert.equal(
    continueDecorators(local, { ...candidate, decoratorDefinitions: local.decoratorDefinitions })
      .decorators?.[0],
    instance,
  );
  assert.notEqual(
    key(local),
    key({ ...renamed, decoratorDefinitions: local.decoratorDefinitions }),
    "continuation scope does not narrow previews",
  );
  const selected = body.faces.find((f) => f.id === instance.faces[0].face);
  assert.ok(selected);
  const connected = {
    ...body,
    faces: body.faces.map((face) => ({
      ...face,
      edges: face.id === selected.id ? ["boundary"] : [],
    })),
  };
  const neighbor = { ...selected, id: "new-neighbor", edges: ["boundary"] };
  assert.notDeepEqual(
    geometryDependency(connected, [selected.id], "adjacent-faces"),
    geometryDependency(
      { ...connected, faces: [...connected.faces, neighbor] },
      [selected.id],
      "adjacent-faces",
    ),
    "newly adjacent faces invalidate without relying on an old dependency list",
  );
});
