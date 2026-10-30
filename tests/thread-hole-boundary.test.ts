import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { decoratedMeshes, initializeMeshRuntime } from "../src/decorators/mesh-runtime.js";
import { MeshScope } from "../src/decorators/mesh-scope.js";
import { threadInformation } from "../src/decorators/thread-information.js";
import { threadDefinition } from "../src/decorators/thread-settings.js";
import { validateMesh } from "../src/model/export-mesh.js";
import type { SketchDocument } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { prism } from "./body-edge-fixtures.js";
import { retainHalf, roundBody, threadedExport } from "./decorator-domain-fixtures.js";

for (const offset of [-3, 0, 3])
  test(`cutting threads into an open hole at ${offset} mm equals slicing the finished hole`, async () => {
    const owner = new DocumentOwner();
    const scope = new MeshScope(await initializeMeshRuntime());
    try {
      const ring = await roundBody(owner, [8, 5.15], 4);
      const full = scope.from(await threadedExport(owner, ring, 5.15, "hole"));
      await retainHalf(
        owner,
        ring,
        { ...planes.YZ, origin: [offset, 0, 0] },
        (b) => b.center[0] < offset,
      );
      const prepared = await owner.call({ kind: "export-geometry" });
      assert.ok(prepared.exportDocument, prepared.error);
      const mesh = decoratedMeshes(scope.runtime, prepared.exportDocument)[0];
      validateMesh(mesh);
      // Splitting retessellates the untouched outer wall. Compare only the thread envelope.
      const envelope = scope.cylinder(4, 6.3, 128);
      const actual = scope.keep(scope.from(mesh).intersect(envelope));
      const expected = scope.keep(
        scope.keep(full.trimByPlane([-1, 0, 0], -offset)).intersect(envelope),
      );
      const excess = scope.keep(actual.subtract(expected)).volume();
      const missing = scope.keep(expected.subtract(actual)).volume();
      assert.ok(excess + missing < 0.001, `Symmetric difference ${excess + missing} mm³`);
      const instance = owner.view.data.decorators?.[0];
      assert.ok(instance);
      assert.deepEqual(threadInformation(owner.view.data.bodies ?? [], instance).warnings, []);
    } finally {
      scope.close();
      owner.close();
    }
  });

test("captured open half-hole clears its flat edges in hole mode", async () => {
  const { document } = JSON.parse(readFileSync("tests/fixtures/thread-open-hole.json", "utf8")) as {
    document: SketchDocument;
  };
  const instance = document.decorators?.[0];
  assert.ok(instance);
  instance.settings.cut = "hole";
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document })).error, undefined);
    const result = await owner.call({ kind: "export-geometry" });
    assert.ok(result.exportDocument, result.error);
    const mesh = decoratedMeshes(await initializeMeshRuntime(), result.exportDocument)[0];
    validateMesh(mesh);
    let notches = 0;
    for (const index of new Set(mesh.triangles.flat())) {
      const [x, y, z] = mesh.vertices[index];
      if (Math.abs(z) > 1e-5 || y < -7.4 || y > -0.1 || Math.abs(x) > 4.8) continue;
      // At every phase the 0.25 mm female relief must clear the original 3.5 mm edge.
      assert.ok(Math.abs(x) >= 3.745, `Uncut flat vertex ${x}, ${y}, ${z}`);
      if (Math.abs(x) > 3.8) notches++;
    }
    assert.ok(notches > 10, "Flat edges contain groove intersections");
  } finally {
    owner.close();
  }
});

test("a hole thread clears a crossbar in its own body but preserves a separate overlapping body", async () => {
  const owner = new DocumentOwner();
  const scope = new MeshScope(await initializeMeshRuntime());
  try {
    const ring = await roundBody(owner, [8, 5.15]);
    const bar = await prism(owner, [
      [-8, -1],
      [8, -1],
      [8, 1],
      [-8, 1],
    ]);
    assert.equal(
      (
        await owner.call({
          kind: "boolean-bodies",
          operation: {
            ids: [ring.id, bar.id],
            mode: "union",
            keepOriginals: false,
          },
        })
      ).error,
      undefined,
    );
    await owner.call({ kind: "accept" });
    const body = owner.view.data.bodies?.[0];
    assert.ok(body);
    const separate = await prism(owner, [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]);
    const face = body.faces.find((face) => face.cylinder?.outward === -1);
    assert.ok(face);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: {
            action: "apply",
            definition: threadDefinition,
            faces: [{ body: body.id, face: face.id }],
            settings: { cut: "hole" },
          },
        })
      ).error,
      undefined,
    );
    const before = JSON.stringify(owner.view.data);
    const result = await owner.call({ kind: "export-geometry" });
    assert.ok(result.exportDocument, result.error);
    const meshes = decoratedMeshes(scope.runtime, result.exportDocument);
    const modified = scope.from(meshes[0]);
    const core = scope.cylinder(10, 4, 64);
    assert.ok(
      scope.keep(modified.intersect(core)).volume() < 1e-6,
      "The crossbar is cleared through the bore",
    );
    const untouchedIndex = result.exportDocument.bodies?.findIndex(
      (body) => body.id === separate.id,
    );
    assert.ok(untouchedIndex !== undefined && untouchedIndex >= 0);
    assert.ok(Math.abs(scope.from(meshes[untouchedIndex]).volume() - separate.volume) < 1e-6);
    assert.equal(
      JSON.stringify(owner.view.data),
      before,
      "Mesh generation never edits accepted BRep",
    );
  } finally {
    scope.close();
    owner.close();
  }
});
