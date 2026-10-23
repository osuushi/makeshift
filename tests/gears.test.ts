import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { gearMeshes } from "../src/decorators/gear-mesh.js";
import {
  gearDefinition,
  gearDimensions,
  gearRadiusForModule,
  gearSettings,
} from "../src/decorators/gear-settings.js";
import { decoratedMeshes, initializeMeshRuntime } from "../src/decorators/mesh-runtime.js";
import { MeshScope } from "../src/decorators/mesh-scope.js";
import type { DecoratorInstance } from "../src/decorators/types.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";
import { validateMesh } from "../src/model/export-mesh.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { lift, prism } from "./body-edge-fixtures.js";

test("normal gear dimensions retain pitch radius and integer count", () => {
  const settings = gearSettings({ teeth: 40, helix: 30 });
  const dimensions = gearDimensions(20, settings, 1);
  assert.ok(Math.abs(dimensions.normalModule - Math.sqrt(3) / 2) < 1e-12);
  assert.ok(Math.abs(gearRadiusForModule(1, 40, 30) - 40 / Math.sqrt(3)) < 1e-12);
  assert.throws(() => gearSettings({ teeth: 12.5 }), /integer/);
});

test("external spur gears remain clear over a full tooth engagement", async () => {
  const owner = new DocumentOwner(),
    runtime = await initializeMeshRuntime();
  const scope = new MeshScope(runtime);
  try {
    const body = await lift(owner, {
      ...emptySketch(planes.XY),
      curves: [
        { id: "circle", kind: "circle", radius: 10, center: { x: 0, y: 0 }, construction: false },
      ],
    });
    const face = body.faces.find((f) => f.cylinder);
    assert.ok(face);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: {
            action: "apply",
            definition: gearDefinition,
            faces: [{ body: body.id, face: face.id }],
            settings: { teeth: 40, thinning: 0.03 },
          },
        })
      ).error,
      undefined,
    );
    const instance = owner.view.data.decorators?.[0];
    assert.ok(instance);
    const profile = scope.from(gearMeshes(owner.view.data, instance, "export").geometry.fill);
    for (let step = 0; step <= 12; step++) {
      const angle = (9 * step) / 12;
      const a = scope.keep(profile.rotate([0, 0, angle]));
      const b = scope.keep(scope.keep(profile.rotate([0, 0, 4.5 - angle])).translate([20, 0, 0]));
      assert.ok(scope.keep(a.intersect(b)).volume() < 1e-5, `interference at ${angle} degrees`);
    }
  } finally {
    scope.close();
    owner.close();
  }
});

test("planar racks and conic bevel gears use real trimmed faces and closed export", async () => {
  const runtime = await initializeMeshRuntime();
  for (const kind of ["rack", "bevel"] as const) {
    const owner = new DocumentOwner();
    try {
      const body =
        kind === "rack"
          ? await prism(owner, [
              [-10, -5],
              [10, -5],
              [10, 5],
              [-10, 5],
            ])
          : await lift(owner, {
              ...emptySketch(planes.XY),
              curves: [
                {
                  id: "circle",
                  kind: "circle",
                  radius: 10,
                  center: { x: 0, y: 0 },
                  construction: false,
                },
              ],
            });
      const face =
        kind === "rack"
          ? body.faces.find(
              (f) => f.plane && f.vertices.every((n, i) => i % 3 !== 2 || Math.abs(n - 10) < 1e-7),
            )
          : body.faces.find((f) => f.cylinder);
      assert.ok(face);
      if (kind === "bevel") {
        owner.beginScript("bevel fixture");
        await owner.scripts.step({
          kind: "replaceFace",
          input: {
            body: body.id,
            face: face.id,
            surface: {
              kind: "cone",
              origin: [0, 0, 0],
              axis: [0, 0, 1],
              radius: 10,
              semiAngle: 30,
            },
          },
        });
        owner.scripts.finish();
        assert.ok(owner.view.data.bodies?.[0].faces.find((f) => f.id === face.id)?.cone);
      }
      assert.equal(
        (
          await owner.call({
            kind: "decorator",
            edit: {
              action: "apply",
              definition: gearDefinition,
              faces: [{ body: body.id, face: face.id }],
            },
          })
        ).error,
        undefined,
      );
      const instance = owner.view.data.decorators?.[0];
      assert.ok(instance);
      if (kind === "rack")
        assert.equal(
          (
            await owner.call({
              kind: "decorator",
              edit: { action: "settings", ids: [instance.id], patch: { helix: 25, direction: 15 } },
            })
          ).error,
          undefined,
        );
      const prepared = await owner.call({ kind: "export-geometry" });
      assert.equal(prepared.error, undefined);
      assert.ok(prepared.exportDocument);
      validateMesh(decoratedMeshes(runtime, prepared.exportDocument)[0]);
    } finally {
      owner.close();
    }
  }
});

test("real external/internal gears apply, edit, reopen and export spur/helical meshes", async () => {
  const runtime = await initializeMeshRuntime();
  for (const hole of [false, true]) {
    const owner = new DocumentOwner();
    try {
      const body = await lift(owner, {
        ...emptySketch(planes.XY),
        curves: (hole ? [14, 10] : [10]).map((radius, i) => ({
          id: `circle${i}`,
          kind: "circle" as const,
          radius,
          center: { x: 0, y: 0 },
          construction: false,
        })),
      });
      const face = body.faces.find((f) => f.cylinder && Math.abs(f.cylinder.radius - 10) < 1e-7);
      assert.ok(face);
      const before = documentArchive(owner.view.data);
      assert.equal(
        (
          await owner.call({
            kind: "decorator",
            edit: {
              action: "apply",
              definition: gearDefinition,
              faces: [{ body: body.id, face: face.id }],
            },
          })
        ).error,
        undefined,
      );
      assert.equal(owner.view.data.decorators?.length, 1);
      await owner.call({ kind: "undo" });
      assert.equal(documentArchive(owner.view.data), before);
      await owner.call({ kind: "redo" });
      const archive = documentArchive(owner.view.data);
      assert.equal(
        (await owner.call({ kind: "open", document: readArchive(archive) })).error,
        undefined,
      );
      for (const helix of [0, 25]) {
        const instance: DecoratorInstance | undefined = owner.view.data.decorators?.[0];
        assert.ok(instance);
        assert.equal(
          (
            await owner.call({
              kind: "decorator",
              edit: { action: "settings", ids: [instance.id], patch: { helix } },
            })
          ).error,
          undefined,
        );
        const updated = owner.view.data.decorators?.[0];
        assert.ok(updated);
        validateMesh(gearMeshes(owner.view.data, updated, "export").geometry.fill);
        const prepared = await owner.call({ kind: "export-geometry" });
        assert.equal(prepared.error, undefined);
        assert.ok(prepared.exportDocument);
        const meshes = decoratedMeshes(runtime, prepared.exportDocument);
        assert.equal(meshes.length, 1);
        validateMesh(meshes[0]);
        const radii = meshes[0].vertices.map(([x, y]) => Math.hypot(x, y));
        if (!hole)
          assert.ok(
            Math.abs(
              Math.max(...radii) -
                (10 + (20 * Math.cos((helix * Math.PI) / 180)) / Number(updated.settings.teeth)),
            ) < 0.06,
          );
      }
    } finally {
      owner.close();
    }
  }
});
