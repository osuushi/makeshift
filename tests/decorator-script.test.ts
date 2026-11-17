import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { DecoratorCatalog } from "../src/agent-script/decorators.js";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { DecoratorDefinition } from "../src/decorators/definition.js";
import type { DecoratorInspection } from "../src/decorators/inspection.js";
import { JavaScriptDecorators } from "../src/decorators/javascript-hooks.js";
import { initializeDecoratorRuntime } from "../src/decorators/javascript-runtime.js";
import { decoratedMeshes, initializeMeshRuntime } from "../src/decorators/mesh-runtime.js";
import { validateMesh } from "../src/model/export-mesh.js";
import { roundBody } from "./decorator-domain-fixtures.js";

test("script thread inspection and edits use current geometry and accept as one Undo step", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await roundBody(owner, [5, 4.8]);
    const faces = body.faces
      .filter((f) => f.cylinder?.radius === 5)
      .map((f) => ({ body: body.id, face: f.id }));
    const before = owner.view.data;
    owner.beginScript("threads.ts");
    const inspection = (await owner.scripts.step({
      kind: "inspectDecorator",
      input: {
        definition: "freac.threads",
        version: 1,
        faces,
        settings: { pitch: 1.5 },
      },
    })) as DecoratorInspection;
    assert.equal(inspection.reason, null);
    assert.equal(inspection.groups.length, 1);
    assert.ok(
      inspection.diagnostics.some((d) => d.message.includes("wall") && d.faces?.length === 2),
    );
    const catalog = (await owner.scripts.step({
      kind: "editDecorator",
      input: {
        action: "apply",
        definition: "freac.threads",
        faces,
      },
    })) as DecoratorCatalog;
    assert.ok(catalog.builtins[0].fields.some((f) => f.key === "pitch"));
    assert.equal(catalog.instances[0].settings.pitch, 1);
    const edited = (await owner.scripts.step({
      kind: "editDecorator",
      input: {
        action: "settings",
        ids: [catalog.instances[0].id],
        patch: { pitch: 1.5, clearance: 0.15 },
      },
    })) as DecoratorCatalog;
    const computed = edited.presets.find((p) => p.settings.pitch === 1.5);
    assert.match(computed?.id ?? "", /^computed:[a-zA-Z0-9+/]{43}=$/);
    await owner.scripts.step({
      kind: "editDecorator",
      input: {
        action: "preset",
        operation: "select",
        ids: [catalog.instances[0].id],
        presetId: computed?.id,
      },
    });
    assert.equal(owner.view.data, before);
    owner.scripts.finish();
    assert.equal(owner.view.data.decorators?.[0].settings.pitch, 1.5);
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data, before);
    await owner.call({ kind: "redo" });
    const accepted = owner.view.data;
    owner.beginScript("inspect.ts");
    const result = (await owner.scripts.step({
      kind: "inspectDecorator",
      input: {
        definition: "freac.threads",
        version: 1,
        faces: body.faces.filter((f) => f.plane).map((f) => ({ body: body.id, face: f.id })),
      },
    })) as DecoratorInspection;
    assert.match(result.reason ?? "", /cylindrical/);
    assert.equal(owner.scripts.finish(), false);
    assert.equal(owner.view.data, accepted);
  } finally {
    owner.close();
  }
});

test("script authors, continues and transforms bundled decorators with atomic source enablement", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await roundBody(owner);
    const faces = body.faces.filter((f) => f.plane).map((f) => ({ body: body.id, face: f.id }));
    const definition: DecoratorDefinition = JSON.parse(
      await readFile("examples/decorators/linked-pads.json", "utf8"),
    );
    const before = owner.view.data;
    let approved = false;
    owner.setDecoratorAuthorization(async () => approved);
    owner.beginScript("pads.ts");
    await owner.scripts.step({
      kind: "editDecoratorDefinition",
      input: { action: "install", definition },
    });
    const disabled = (await owner.scripts.step({
      kind: "inspectDecorator",
      input: {
        definition: definition.id,
        version: 1,
        faces,
      },
    })) as DecoratorInspection;
    assert.match(disabled.reason ?? "", /Enable bundled code/);
    await assert.rejects(
      owner.scripts.step({
        kind: "enableDecorator",
        input: { id: definition.id, version: 1, enabled: true },
      }),
      /disabled/,
    );
    approved = true;
    await owner.scripts.step({
      kind: "enableDecorator",
      input: { id: definition.id, version: 1, enabled: true },
    });
    const added = (await owner.scripts.step({
      kind: "editDecorator",
      input: {
        action: "apply",
        definition: definition.id,
        faces: [faces[0]],
        settings: { height: 2 },
      },
    })) as DecoratorCatalog;
    await owner.scripts.step({
      kind: "editDecorator",
      input: {
        action: "continue",
        id: added.instances[0].id,
        faces: [faces[1]],
      },
    });
    await owner.scripts.step({
      kind: "transformBodies",
      input: {
        ids: [body.id],
        translation: [3, 0, 0],
        pivot: [0, 0, 0],
        axis: [0, 0, 1],
        angle: 0,
        duplicate: false,
      },
    });
    const candidate = (await owner.scripts.step({
      kind: "decorators",
      input: {},
    })) as DecoratorCatalog;
    assert.equal(candidate.instances.length, 1);
    assert.equal(candidate.instances[0].faces.length, 2);
    assert.equal(candidate.instances[0].settings.height, 2);
    assert.equal(candidate.instances[0].problem, undefined);
    assert.deepEqual(candidate.instances[0].frame.origin, [3, 0, 0]);
    assert.equal(owner.view.data, before);
    assert.equal(owner.view.decoratorSources?.length, 0);
    owner.scripts.finish();
    const accepted = owner.view.data;
    assert.equal(owner.view.decoratorSources?.[0].source, definition.source);
    const snapshot = (await owner.call({ kind: "export-geometry" })).exportDocument;
    assert.ok(snapshot);
    const hooks = new JavaScriptDecorators(
      await initializeDecoratorRuntime(),
      owner.view.decoratorSources,
    );
    const mesh = decoratedMeshes(await initializeMeshRuntime(), snapshot, hooks)[0];
    validateMesh(mesh);
    assert.ok(mesh.vertices.some((p) => p[2] > 11.99));
    assert.ok(mesh.vertices.some((p) => p[2] < -1.99));
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.equal(owner.view.data, accepted);
    await verifySourceRollback(owner, definition, candidate.instances[0].id);
  } finally {
    owner.close();
  }
});

async function verifySourceRollback(
  owner: DocumentOwner,
  definition: DecoratorDefinition,
  id: string,
) {
  const before = owner.view.data;
  owner.beginScript("replacement.ts");
  const replacement = { ...definition, source: `${definition.source}\n// replacement` };
  await owner.scripts.step({
    kind: "editDecoratorDefinition",
    input: { action: "install", definition: replacement },
  });
  await owner.scripts.step({
    kind: "enableDecorator",
    input: { id: definition.id, version: 1, enabled: true },
  });
  await assert.rejects(
    () =>
      owner.scripts.step({
        kind: "editDecorator",
        input: {
          action: "settings",
          ids: [id],
          patch: { height: -10 },
        },
      }),
    /Invalid/,
  );
  await owner.scripts.cancel("Invalid pad height");
  assert.equal(owner.view.data, before);
  assert.equal(owner.view.decoratorSources?.[0].source, definition.source);
  owner.beginScript("disable.ts");
  await owner.scripts.step({
    kind: "enableDecorator",
    input: { id: definition.id, version: 1, enabled: false },
  });
  assert.equal(owner.scripts.finish(), false);
  assert.equal(owner.view.decoratorSources?.length, 0);
}
