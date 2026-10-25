import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { DecoratorDisplayMode } from "../src/decorators/display-mode.js";
import { effectiveDecoratorDisplay } from "../src/decorators/display-mode.js";
import { editDecorators, validateDecorators } from "../src/decorators/edits.js";
import { needsJavaScript } from "../src/decorators/javascript-edits.js";
import { decoratorPreview } from "../src/decorators/mesh-runtime.js";
import { previewDisplaySignatures } from "../src/decorators/preview-signatures.js";
import type { DecoratorInstance } from "../src/decorators/types.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";
import type { SketchDocument } from "../src/sketch/document.js";
import { roundBody } from "./decorator-domain-fixtures.js";

test("saved display edits isolate instances, preserve geometry, and support Undo, Redo and By default", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await roundBody(owner, [8, 6]);
    const faces = body.faces
      .filter((face) => face.cylinder)
      .map((face) => ({ body: body.id, face: face.id }));
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: { action: "apply", definition: "freac.threads", faces },
        })
      ).error,
      undefined,
    );
    const before = owner.view.data;
    const first = before.decorators?.[0],
      second = before.decorators?.[1];
    assert.ok(first && second);
    const preview = decoratorPreview(undefined, before, first);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: { action: "display", ids: [first.id], mode: "texture" },
        })
      ).error,
      undefined,
    );
    const after = owner.view.data;
    assert.equal(after.decorators?.[0].display, "texture");
    assert.deepEqual(after.decorators?.[1], second);
    assert.deepEqual(after.bodies, before.bodies);
    assert.deepEqual(after.decoratorPresets, before.decoratorPresets);
    assert.deepEqual(after.lastDecoratorChoices, before.lastDecoratorChoices);
    assert.deepEqual(
      decoratorPreview(undefined, after, after.decorators?.[0] as DecoratorInstance),
      preview,
    );
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, after);
    assert.equal(
      (await owner.call({ kind: "open", document: readArchive(documentArchive(after)) })).error,
      undefined,
    );
    assert.equal(owner.view.data.decorators?.[0].display, "texture");
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: { action: "display", ids: [first.id], mode: "default" },
        })
      ).error,
      undefined,
    );
    assert.equal(Object.hasOwn(owner.view.data.decorators?.[0] ?? {}, "display"), false);
    for (const mode of ["detailed", "texture", "color-only"] as const)
      assert.equal(
        effectiveDecoratorDisplay(owner.view.data.decorators?.[0] as DecoratorInstance, mode),
        mode,
      );
    const invalid = {
      ...after,
      decorators: after.decorators?.map((d) => ({
        ...d,
        display: "invalid" as DecoratorDisplayMode,
      })),
    };
    assert.throws(() => validateDecorators(invalid), /Invalid decorator instance/);
    assert.throws(
      () =>
        editDecorators(after, { action: "display", ids: [first.id, "missing"], mode: "texture" }),
      /existing decorators/,
    );
  } finally {
    owner.close();
  }
});

test("custom overrides need no executable plugin and resolved modes invalidate only affected built-in previews", () => {
  const instances: DecoratorInstance[] = ["a", "b", "c"].map((id) => ({
    id,
    definition: "freac.threads",
    version: 1,
    settings: {},
    faces: [],
    frame: { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0] },
  }));
  instances[0] = { ...instances[0], display: "texture" };
  instances[1] = { ...instances[1], display: "color-only" };
  const document: SketchDocument = { units: "mm", sketches: [], decorators: instances };
  const geometryDefault = previewDisplaySignatures(document, "[]", "detailed");
  const textureDefault = previewDisplaySignatures(document, "[]", "texture");
  assert.equal(geometryDefault.get("a"), textureDefault.get("a"));
  assert.equal(geometryDefault.get("b"), textureDefault.get("b"));
  assert.notEqual(geometryDefault.get("c"), textureDefault.get("c"));
  assert.equal(
    needsJavaScript(
      { ...document, decorators: instances.map((d) => ({ ...d, definition: "custom.disabled" })) },
      { action: "display", ids: ["a"], mode: "texture" },
    ),
    false,
  );
});
