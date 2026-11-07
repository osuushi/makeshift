import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { decoratedMeshes, initializeMeshRuntime } from "../src/decorators/mesh-runtime.js";
import { threadDefinition } from "../src/decorators/thread-settings.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";
import { encodeMeshes } from "../src/model/mesh-export.js";
import { prism, square } from "./body-edge-fixtures.js";
import { roundBody } from "./decorator-domain-fixtures.js";
import { feature, selected } from "./face-movement-fixtures.js";

for (const route of ["delete-topology", "delete-entities"] as const)
  test(`${route}: deleting a threaded hole removes its decoration and permits 3MF export`, async () => {
    const owner = new DocumentOwner();
    try {
      await prism(owner, square);
      const body = await feature(owner, "hole");
      const faces = selected(body, "hole");
      assert.equal(faces.length, 1);
      assert.equal(
        (
          await owner.call({
            kind: "decorator",
            edit: {
              action: "apply",
              definition: threadDefinition,
              faces,
            },
          })
        ).error,
        undefined,
      );
      const before = owner.view.data;
      assert.equal(before.decorators?.length, 1);
      const selection = [
        { body: body.id, whole: false, faces: faces.map((f) => f.face), edges: [] },
      ];
      const result = await owner.call(
        route === "delete-topology"
          ? { kind: route, selection }
          : { kind: route, bodyIds: [], sketchIds: [], topology: selection },
      );
      assert.equal(result.error, undefined);
      assert.equal(owner.view.data.decorators?.length, 0);
      assert.equal(owner.view.data.bodies?.[0].faces.length, 6);
      const after = owner.view.data;
      assert.equal((await owner.call({ kind: "undo" })).error, undefined);
      assert.deepEqual(owner.view.data, before);
      assert.equal((await owner.call({ kind: "redo" })).error, undefined);
      assert.deepEqual(owner.view.data, after);
      const exported = await owner.call({ kind: "export-geometry" });
      assert.equal(exported.error, undefined);
      assert.ok(exported.exportDocument);
      const meshes = decoratedMeshes(await initializeMeshRuntime(), exported.exportDocument);
      assert.ok(encodeMeshes(meshes, "3mf").length > 0);
    } finally {
      owner.close();
    }
  });

test("filling a threaded bore drops its decorator in the same Undo step", async () => {
  const owner = new DocumentOwner();
  try {
    const tube = await roundBody(owner, [8, 4]);
    const plug = await roundBody(owner);
    const faces = tube.faces
      .filter((face) => face.cylinder)
      .map((face) => ({ body: tube.id, face: face.id }));
    assert.equal(faces.length, 2);
    const applied = await owner.call({
      kind: "decorator",
      edit: { action: "apply", definition: threadDefinition, faces },
    });
    assert.equal(applied.error, undefined);
    const before = owner.view.data;
    const bore = tube.faces.find((face) => face.cylinder?.outward === -1);
    assert.ok(bore);
    const outer = before.decorators?.find((instance) => instance.faces[0].face !== bore.id);
    assert.ok(outer);
    assert.equal(before.decorators?.length, 2);

    const union = await owner.call({
      kind: "boolean-bodies",
      operation: { ids: [tube.id, plug.id], mode: "union", keepOriginals: false },
    });
    assert.equal(union.error, undefined);
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const after = owner.view.data;
    assert.equal(after.bodies?.length, 1);
    assert.equal(after.bodies?.[0].faces.filter((face) => face.cylinder).length, 1);
    assert.deepEqual(
      after.decorators?.map(({ id, problem }) => ({ id, problem })),
      [{ id: outer.id, problem: undefined }],
    );
    assert.equal((await owner.call({ kind: "export-geometry" })).error, undefined);
    assert.equal((await owner.call({ kind: "undo" })).error, undefined);
    assert.deepEqual(owner.view.data, before);
    assert.equal((await owner.call({ kind: "redo" })).error, undefined);
    assert.deepEqual(owner.view.data, after);
  } finally {
    owner.close();
  }
});

test("opening an older drawing drops dangling decorators and preserves valid attachments", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await roundBody(owner);
    const cylinder = body.faces.find((face) => face.cylinder);
    assert.ok(cylinder);
    const faces = [{ body: body.id, face: cylinder.id }];
    const applied = await owner.call({
      kind: "decorator",
      edit: { action: "apply", definition: threadDefinition, faces },
    });
    assert.equal(applied.error, undefined);
    const valid = owner.view.data.decorators?.[0];
    assert.ok(valid);
    const missing = { body: body.id, face: "removed-face" };
    const legacy = {
      ...valid,
      problem: "The decorated faces were removed. Reassign or remove the decoration.",
    };
    const source = readArchive(
      documentArchive({
        ...owner.view.data,
        decorators: [
          valid,
          { ...legacy, id: "lost-thread", faces: [missing] },
          { ...legacy, id: "partly-lost-thread", faces: [...faces, missing] },
        ],
      }),
    );
    assert.equal((await owner.call({ kind: "open", document: source })).error, undefined);
    assert.deepEqual(owner.view.data.decorators, [source.decorators?.[0]]);
    assert.equal((await owner.call({ kind: "export-geometry" })).error, undefined);
  } finally {
    owner.close();
  }
});
