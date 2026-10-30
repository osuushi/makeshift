import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { cylinderFrame } from "../src/decorators/cylinder.js";
import { decoratedMeshes, initializeMeshRuntime } from "../src/decorators/mesh-runtime.js";
import { threadRadius } from "../src/decorators/thread-mesh.js";
import {
  threadDefaults,
  threadDefinition,
  threadSettings,
} from "../src/decorators/thread-settings.js";
import type { FaceReference } from "../src/decorators/types.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";
import { validateMesh } from "../src/model/export-mesh.js";
import { encodeMeshes } from "../src/model/mesh-export.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { lift } from "./body-edge-fixtures.js";

async function cylinder(owner: DocumentOwner, hole = false): Promise<FaceReference> {
  const body = await lift(owner, {
    ...emptySketch(planes.XY),
    curves: (hole ? [8, 5] : [5]).map((radius, i) => ({
      id: `circle${i}`,
      kind: "circle" as const,
      radius,
      center: { x: 0, y: 0 },
      construction: false,
    })),
  });
  const face = body.faces.find((f) => f.cylinder && Math.abs(f.cylinder.radius - 5) < 1e-7);
  assert.ok(face);
  return { body: body.id, face: face.id };
}

test("threads apply atomically to rod/hole, patch only the requested setting, Undo and reopen", async () => {
  const owner = new DocumentOwner();
  try {
    const refs = [await cylinder(owner), await cylinder(owner, true)];
    const before = documentArchive(owner.view.data);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: {
            action: "apply",
            definition: threadDefinition,
            faces: refs,
          },
        })
      ).error,
      undefined,
    );
    const instances = owner.view.data.decorators ?? [];
    assert.equal(instances.length, 2);
    assert.deepEqual(instances[1].settings, {
      ...instances[0].settings,
      startTaper: 0,
      endTaper: 0,
    });
    assert.equal(instances[0].settings.startTaper, instances[0].settings.pitch);
    assert.equal(instances[0].settings.endTaper, instances[0].settings.pitch);
    assert.equal(instances[0].settings.pitch, 1);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: {
            action: "settings",
            ids: [instances[0].id],
            patch: { hand: "left" },
          },
        })
      ).error,
      undefined,
    );
    assert.equal((owner.view.data.decorators ?? [])[1].settings.hand, "right");
    await owner.call({ kind: "undo" });
    assert.equal((owner.view.data.decorators ?? [])[0].settings.hand, "right");
    await owner.call({ kind: "undo" });
    assert.equal(documentArchive(owner.view.data), before);
    await owner.call({ kind: "redo" });
    const archive = documentArchive(owner.view.data);
    assert.equal(
      (await owner.call({ kind: "open", document: readArchive(archive) })).error,
      undefined,
    );
    assert.deepEqual(owner.view.data.decorators, instances);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: {
            action: "apply",
            definition: threadDefinition,
            faces: refs,
          },
        })
      ).error,
      undefined,
    );
    assert.equal(
      (owner.view.data.decorators ?? []).length,
      2,
      "reapplication cannot stack threads",
    );
    assert.equal(
      (await owner.call({ kind: "decorator", edit: { action: "remove", faces: [refs[0]] } })).error,
      undefined,
    );
    assert.equal((owner.view.data.decorators ?? []).length, 1);
    const invalid = await owner.call({
      kind: "decorator",
      edit: {
        action: "settings",
        ids: [instances[1].id],
        patch: { start: 10 },
      },
    });
    assert.match(invalid.error ?? "", /no threaded length/);
    assert.equal((owner.view.data.decorators ?? [])[0].settings.start, 0);
  } finally {
    owner.close();
  }
});

test("same nonstandard diameter resolves consistently and hand reverses the helix", () => {
  assert.equal(threadDefaults(10.3, "metric").pitch, 1.5);
  const settings = { ...threadDefaults(10.3, "metric"), startTaper: 0, endTaper: 0 };
  const flankRise =
    threadRadius(5.15, 0, settings.pitch * 0.2, settings, 1, [0, 10]) -
    threadRadius(5.15, 0, settings.pitch * 0.25, settings, 1, [0, 10]);
  assert.ok(
    Math.abs(flankRise / (settings.pitch * 0.05) - Math.sqrt(3)) < 1e-10,
    "metric flank must have a 60 degree included thread angle",
  );
  for (const cut of ["rod", "hole"] as const) {
    settings.cut = cut;
    for (const angle of [0, 0.4, 2, 4.7])
      for (const z of [0.1, 0.5, 1.7]) {
        const rod = threadRadius(5.15, angle, z, settings, 1, [0, 10]);
        const hole = threadRadius(5.15, angle, z, settings, -1, [0, 10]);
        assert.ok(Math.abs(hole - rod - settings.clearance) < 1e-10);
        assert.equal(rod, threadRadius(5.15, -angle, z, { ...settings, hand: "left" }, 1, [0, 10]));
      }
  }
  const a = cylinderFrame({ origin: [2, 3, 7], axis: [0, 0, 1], radius: 5, outward: 1 });
  const b = cylinderFrame({ origin: [2, 3, 15], axis: [0, 0, -1], radius: 5, outward: 1 });
  for (const field of ["origin", "u", "v"] as const)
    assert.ok(
      a[field].every((n, i) => Math.abs(n - b[field][i]) < 1e-12),
      "cylinder parameter-axis reversal must not restart the helix",
    );
});

test("deleting a body removes its decorators in the same Undo step", async () => {
  const owner = new DocumentOwner();
  try {
    const ref = await cylinder(owner);
    await owner.call({
      kind: "decorator",
      edit: { action: "apply", definition: threadDefinition, faces: [ref] },
    });
    const before = documentArchive(owner.view.data);
    await owner.call({ kind: "delete-entities", bodyIds: [ref.body], sketchIds: [] });
    assert.equal(owner.view.data.decorators?.length, 0);
    await owner.call({ kind: "undo" });
    assert.equal(documentArchive(owner.view.data), before);
  } finally {
    owner.close();
  }
});

test("FDM fine and coarse export watertight complementary threads in both cut modes", async () => {
  const runtime = await initializeMeshRuntime();
  const owner = new DocumentOwner();
  try {
    const refs = [await cylinder(owner), await cylinder(owner, true)];
    await owner.call({
      kind: "decorator",
      edit: { action: "apply", definition: threadDefinition, faces: refs },
    });
    for (const preset of ["fdm-fine", "fdm-coarse"] as const)
      for (const cut of ["rod", "hole"] as const) {
        const instances = owner.view.data.decorators ?? [];
        assert.equal(
          (
            await owner.call({
              kind: "decorator",
              edit: {
                action: "settings",
                ids: instances.map((d) => d.id),
                patch: { preset, cut },
              },
            })
          ).error,
          undefined,
        );
        const before = documentArchive(owner.view.data);
        const prepared = await owner.call({ kind: "export-geometry" });
        assert.equal(prepared.error, undefined);
        assert.ok(prepared.exportDocument);
        const meshes = decoratedMeshes(runtime, prepared.exportDocument);
        assert.equal(meshes.length, 2);
        for (const mesh of meshes) validateMesh(mesh);
        for (const format of ["3mf", "stl"] as const)
          assert.ok(encodeMeshes(meshes, format).length > 100);
        const solids = meshes.map(
          (mesh) =>
            new runtime.Manifold(
              new runtime.Mesh({
                numProp: 3,
                vertProperties: new Float32Array(mesh.vertices.flat()),
                triVerts: new Uint32Array(mesh.triangles.flat()),
              }),
            ),
        );
        const intersection = solids[0].intersect(solids[1]);
        try {
          assert.ok(
            intersection.volume() < 1e-6,
            `mating ${preset}/${cut} threads must not collide`,
          );
        } finally {
          intersection.delete();
          for (const solid of solids) solid.delete();
        }
        assert.equal(
          documentArchive(owner.view.data),
          before,
          "export never changes accepted geometry/settings",
        );
        assert.equal(threadSettings((owner.view.data.decorators ?? [])[0].settings).cut, cut);
      }
  } finally {
    owner.close();
  }
});
