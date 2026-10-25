import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import {
  type DecoratorDefinition,
  definitionSettings,
  validateDefinition,
} from "../src/decorators/definition.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";

const definition: DecoratorDefinition = {
  id: "example.ridges",
  version: 1,
  name: "Ridges",
  source: 'throw new Error("Must not execute on installation or open"); export default {};',
  fields: [
    { key: "height", label: "Height", type: "number", unit: "mm", min: 0.1, max: 10, default: 1 },
  ],
};

test("bundled source installs and replaces atomically with Undo and inert archive reopening", async () => {
  const owner = new DocumentOwner();
  try {
    const before = documentArchive(owner.view.data);
    assert.equal(
      (await owner.call({ kind: "decorator-definition", edit: { action: "install", definition } }))
        .error,
      undefined,
    );
    const installed = documentArchive(owner.view.data);
    assert.ok(installed.includes("Must not execute"));
    const replacement = { ...definition, source: "export default { generate() { return []; } };" };
    assert.equal(
      (
        await owner.call({
          kind: "decorator-definition",
          edit: { action: "install", definition: replacement },
        })
      ).error,
      undefined,
    );
    assert.equal(owner.view.data.decoratorDefinitions?.length, 1);
    assert.equal(owner.view.data.decoratorDefinitions[0].source, replacement.source);
    await owner.call({ kind: "undo" });
    assert.equal(documentArchive(owner.view.data), installed);
    await owner.call({ kind: "undo" });
    assert.equal(documentArchive(owner.view.data), before);
    await owner.call({ kind: "redo" });
    assert.equal(
      (await owner.call({ kind: "open", document: readArchive(installed) })).error,
      undefined,
    );
    assert.deepEqual(owner.view.data.decoratorDefinitions, [definition]);
    const reopened = documentArchive(owner.view.data);
    const bad = { ...definition, fields: [{ ...definition.fields[0], default: -1 }] };
    assert.match(
      (
        await owner.call({
          kind: "decorator-definition",
          edit: { action: "install", definition: bad },
        })
      ).error ?? "",
      /Invalid Ridges/,
    );
    assert.equal(documentArchive(owner.view.data), reopened);
  } finally {
    owner.close();
  }
});

test("definition schema rejects ambiguous keys and validates settings without executing code", () => {
  validateDefinition(definition);
  assert.deepEqual(definitionSettings(definition, {}), { height: 1 });
  assert.throws(() => definitionSettings(definition, { height: 0 }), /Invalid/);
  assert.throws(() => definitionSettings(definition, { mystery: 2 }), /Unknown/);
  assert.throws(() => validateDefinition({ ...definition, id: "freac.threads" }), /Invalid/);
  assert.throws(() => validateDefinition({ ...definition, livePreview: true }), /Invalid/);
  assert.throws(
    () => validateDefinition({ ...definition, livePreview: "yes" as never }),
    /Invalid/,
  );
  validateDefinition({ ...definition, preview: true, livePreview: true });
  validateDefinition({
    ...definition,
    dependencies: { continuation: "faces", preview: "adjacent-faces" },
  });
  for (const dependencies of [null, [], { preview: "everything" }, { unknown: "faces" }])
    assert.throws(
      () => validateDefinition({ ...definition, dependencies: dependencies as never }),
      /Invalid/,
    );
  assert.throws(
    () =>
      validateDefinition({ ...definition, fields: [...definition.fields, ...definition.fields] }),
    /schema/,
  );
});
