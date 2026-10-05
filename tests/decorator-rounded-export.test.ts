import assert from "node:assert/strict";
import test from "node:test";
import type { Manifold } from "manifold-3d";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { decoratedMeshes, initializeMeshRuntime } from "../src/decorators/mesh-runtime.js";
import { type ExportMesh, validateMesh } from "../src/model/export-mesh.js";
import { encodeMeshes } from "../src/model/mesh-export.js";
import { roundBody } from "./decorator-domain-fixtures.js";

test("saved rounded thread dimensions export complementary surfaces in both cut modes", async () => {
  const runtime = await initializeMeshRuntime();
  const owner = new DocumentOwner();
  try {
    const bodies = [await roundBody(owner, [5.15], 6), await roundBody(owner, [8, 5.15], 10)];
    const faces = bodies.flatMap((body) =>
      body.faces
        .filter((f) => Math.abs((f.cylinder?.radius ?? 0) - 5.15) < 1e-7)
        .map((f) => ({ body: body.id, face: f.id })),
    );
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: { action: "apply", definition: "freac.threads", faces },
        })
      ).error,
      undefined,
    );
    const ids = owner.view.data.decorators?.map((d) => d.id) ?? [];
    for (const pitch of [1.8, 3])
      for (const cut of ["rod", "hole"]) {
        assert.equal(
          (
            await owner.call({
              kind: "decorator",
              edit: {
                action: "settings",
                ids,
                patch: {
                  preset: "custom",
                  profile: "rounded",
                  pitch,
                  clearance: 0.3,
                  cut,
                  layerHeight: 0.3,
                  nozzleDiameter: 0.6,
                  hand: "left",
                },
              },
            })
          ).error,
          undefined,
        );
        const settings = owner.view.data.decorators?.[0].settings;
        assert.ok(settings);
        assert.equal(settings.profile, "rounded");
        const snapshot = (await owner.call({ kind: "export-geometry" })).exportDocument;
        assert.ok(snapshot);
        let meshes: ExportMesh[];
        try {
          meshes = decoratedMeshes(runtime, snapshot);
        } catch (error) {
          throw new Error(`${pitch}/${cut}: ${error}`);
        }
        for (const mesh of meshes) validateMesh(mesh);
        for (const format of ["stl", "3mf"] as const)
          assert.ok(encodeMeshes(meshes, format).length > 100);
        const solids: Manifold[] = meshes.map(
          (mesh) =>
            new runtime.Manifold(
              new runtime.Mesh({
                numProp: 3,
                vertProperties: new Float32Array(mesh.vertices.flat()),
                triVerts: new Uint32Array(mesh.triangles.flat()),
              }),
            ),
        );
        try {
          for (const fraction of [0.25, 0.75]) {
            const rotated = solids[0].rotate([0, 0, -360 * fraction]);
            const moved: Manifold = rotated.translate([0, 0, Number(settings.pitch) * fraction]);
            const collision: Manifold = moved.intersect(solids[1]);
            try {
              assert.equal(collision.status(), "NoError");
              assert.ok(
                collision.volume() < 1e-6,
                `${pitch}/${cut} rounded threads collide during screw motion`,
              );
            } finally {
              collision.delete();
              moved.delete();
              rotated.delete();
            }
          }
        } finally {
          for (const solid of solids) solid.delete();
        }
      }
  } finally {
    owner.close();
  }
});
