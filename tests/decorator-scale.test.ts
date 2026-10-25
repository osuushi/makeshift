import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { gearGroupProblem } from "../src/decorators/gear-group.js";
import { decoratedMeshes, initializeMeshRuntime } from "../src/decorators/mesh-runtime.js";
import type { Face } from "../src/model/body.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";
import { validateMesh } from "../src/model/export-mesh.js";
import { planes, type Vector } from "../src/sketch/planes.js";
import { retainHalf, roundBody } from "./decorator-domain-fixtures.js";

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);

const scale = (owner: DocumentOwner, id: string, factors: Vector, pivot: Vector = [0, 0, 0]) =>
  owner.call({
    kind: "scale",
    operation: { kind: "solids", ids: [id], faces: [], edges: [], pivot, factor: 1, factors },
  });

for (const definition of ["freac.threads", "freac.knurling", "freac.gear"]) {
  test(`${definition} survives axial and equal radial scaling with identity, settings and Undo`, async () => {
    const owner = new DocumentOwner();
    try {
      const body = await roundBody(owner);
      const face = body.faces.find((f) => f.cylinder);
      assert.ok(face);
      assert.equal(
        (
          await owner.call({
            kind: "decorator",
            edit: { action: "apply", definition, faces: [{ body: body.id, face: face.id }] },
          })
        ).error,
        undefined,
      );
      const original = owner.view.data.decorators?.[0];
      assert.ok(original);
      for (const factors of [
        [1, 1, 1.5],
        [2, 2, 1],
      ] satisfies Vector[]) {
        const before = documentArchive(owner.view.data);
        const old = owner.view.data.bodies?.[0];
        assert.ok(old);
        const pivot: Vector = [3, -4, 2];
        const reply = await scale(owner, body.id, factors, pivot);
        assert.equal(reply.error, undefined);
        const next = reply.view.candidate?.bodies?.[0];
        assert.ok(next);
        close(next.volume, old.volume * factors[0] * factors[1] * factors[2]);
        next.bounds.forEach((value, i) => {
          const axis = i % 3;
          close(value, pivot[axis] + (old.bounds[i] - pivot[axis]) * factors[axis]);
        });
        assert.ok(next.faces.find((f) => f.id === face.id)?.cylinder);
        const decoration = reply.view.candidate?.decorators?.[0];
        assert.equal(decoration?.problem, undefined);
        assert.equal(decoration?.id, original.id);
        assert.ok(decoration);
        if (definition === "freac.gear" && factors[0] !== 1) {
          // Groups refit tooth count/profile when pitch diameter changes.
          for (const [key, value] of Object.entries(original.settings))
            if (!["teeth", "addendum", "pressure"].includes(key))
              assert.equal(decoration.settings[key], value);
          assert.notEqual(decoration.settings.teeth, original.settings.teeth);
          assert.equal(gearGroupProblem(reply.view.candidate ?? reply.view.data, decoration), null);
        } else assert.deepEqual(decoration.settings, original.settings);
        assert.deepEqual(decoration?.faces, original.faces);
        assert.equal((await owner.call({ kind: "accept" })).error, undefined);
        const after = documentArchive(owner.view.data);
        await owner.call({ kind: "undo" });
        assert.equal(documentArchive(owner.view.data), before);
        await owner.call({ kind: "redo" });
        assert.equal(documentArchive(owner.view.data), after);
        assert.equal(
          (await owner.call({ kind: "open", document: readArchive(after) })).error,
          undefined,
        );
        assert.equal(owner.view.data.decorators?.[0].problem, undefined);
        assert.ok(owner.view.data.bodies?.[0].faces.find((f) => f.id === face.id)?.cylinder);
      }
      const elliptical = await scale(owner, body.id, [2, 1, 1]);
      assert.equal(elliptical.error, undefined);
      assert.ok(elliptical.view.candidate?.decorators?.[0].problem);
      assert.ok(
        !elliptical.view.candidate?.bodies?.[0].faces.find((f) => f.id === face.id)?.cylinder,
      );
    } finally {
      owner.close();
    }
  });
}

test("trimmed inner and outer cylinders retain decorations when stretched along a rotated axis", async () => {
  const owner = new DocumentOwner();
  try {
    const ring = await roundBody(owner, [10, 7]);
    const body = await retainHalf(owner, ring, planes.YZ, (b) => b.center[0] > 0);
    const faces = body.faces.filter((f) => f.cylinder).map((f) => ({ body: body.id, face: f.id }));
    assert.equal(faces.length, 4);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: { action: "apply", definition: "freac.threads", faces },
        })
      ).error,
      undefined,
    );
    assert.equal(
      (
        await owner.call({
          kind: "transform-bodies",
          transform: {
            ids: [body.id],
            pivot: [0, 0, 0],
            axis: [1, 0, 0],
            translation: [12, 3, -2],
            angle: 90,
            duplicate: false,
          },
        })
      ).error,
      undefined,
    );
    const before = owner.view.data;
    const reply = await scale(owner, body.id, [1, 1.5, 1]);
    assert.equal(reply.error, undefined);
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const after = owner.view.data;
    assert.equal(after.decorators?.length, 2);
    assert.deepEqual(
      after.decorators?.map((d) => d.settings),
      before.decorators?.map((d) => d.settings),
    );
    for (const decoration of after.decorators ?? []) assert.equal(decoration.problem, undefined);
    const next = after.bodies?.[0];
    assert.ok(next);
    close(next.volume, body.volume * 1.5);
    for (const target of faces) {
      const cylinder: Face["cylinder"] = next.faces.find((f) => f.id === target.face)?.cylinder;
      const original = body.faces.find((f) => f.id === target.face)?.cylinder;
      assert.ok(cylinder && original);
      close(cylinder.radius, original.radius);
      close(Math.abs(cylinder.axis[1]), 1);
      assert.equal(cylinder.outward, original.outward);
    }
    const meshes = decoratedMeshes(await initializeMeshRuntime(), after);
    assert.equal(meshes.length, 1);
    for (const mesh of meshes) validateMesh(mesh);
  } finally {
    owner.close();
  }
});
