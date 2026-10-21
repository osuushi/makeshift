import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { decoratedMeshes, initializeMeshRuntime } from "../src/decorators/mesh-runtime.js";
import { threadDefinition } from "../src/decorators/thread-settings.js";
import { encodeMeshes } from "../src/model/mesh-export.js";
import { prism, square } from "./body-edge-fixtures.js";
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
