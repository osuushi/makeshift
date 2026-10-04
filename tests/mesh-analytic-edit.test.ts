import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { independentMesh, primitiveMesh } from "./mesh-import-fixtures.js";

for (const name of ["sphere", "cylinder", "capsule"] as const)
  test(`recovered ${name} supports face offset, identity, Undo and reopen`, async () => {
    const owner = new DocumentOwner();
    const mesh = name === "sphere" ? independentMesh("uv") : primitiveMesh(name);
    try {
      assert.equal(
        (
          await owner.call({
            kind: "reconstruct-mesh",
            input: { mesh, tolerance: 0.07, maxPatches: 24 },
          })
        ).error,
        undefined,
      );
      await owner.call({ kind: "accept" });
      const accepted = owner.view.data,
        body = accepted.bodies?.[0];
      assert(body);
      assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
      const reopened = owner.view.data;
      const face = body.faces.find((f) => (name === "sphere" ? f.sphere : f.cylinder));
      assert(face);
      assert.equal(face.blend, null, "primitive surfaces are not fillet controls");
      const result = await owner.call({
        kind: "offset-faces",
        operation: { faces: [{ body: body.id, face: face.id }], distance: 1 },
      });
      assert.equal(result.error, undefined);
      assert.equal(result.view.offsetDistance, 1);
      assert.deepEqual(result.view.data, reopened);
      const grown = result.view.candidate?.bodies?.[0];
      assert(grown);
      const expected =
        name === "sphere"
          ? (4 * Math.PI * 11 ** 3) / 3
          : Math.PI * 49 * 20 + (name === "capsule" ? (4 * Math.PI * 343) / 3 : 0);
      assert(Math.abs(grown.volume / expected - 1) < 1e-5);
      assert.equal(grown.id, body.id);
      assert(grown.faces.some((f) => f.id === face.id));
      await owner.call({ kind: "accept" });
      await owner.call({ kind: "undo" });
      assert.deepEqual(owner.view.data, reopened);
      await owner.call({ kind: "redo" });
      assert.equal(owner.view.data.bodies?.[0].brep, grown.brep);
    } finally {
      owner.close();
    }
  });
