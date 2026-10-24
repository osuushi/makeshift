import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { gearGroupProblem } from "../src/decorators/gear-group.js";
import { toothTipWidth } from "../src/decorators/gear-group-fit.js";
import { gearMeshes } from "../src/decorators/gear-mesh.js";
import { gearOperands } from "../src/decorators/gear-runtime.js";
import { gearDefinition } from "../src/decorators/gear-settings.js";
import { inspectGear } from "../src/decorators/gear-support.js";
import { decoratedMeshes, initializeMeshRuntime } from "../src/decorators/mesh-runtime.js";
import { MeshScope } from "../src/decorators/mesh-scope.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";
import { validateMesh } from "../src/model/export-mesh.js";
import { encodeMeshes } from "../src/model/mesh-export.js";
import type { SketchDocument } from "../src/sketch/document.js";

const fixture: { document: SketchDocument } = JSON.parse(
  await readFile("tests/fixtures/gear-ring-pinion.json", "utf8"),
);
const faces = fixture.document.decorators?.flatMap((d) => d.faces) ?? [];

for (const order of ["together", "pinion first", "ring first", "repair capture"] as const) {
  test(`captured 20/10 mm ring and pinion fit automatically: ${order}`, async () => {
    const owner = new DocumentOwner();
    try {
      const document =
        order === "repair capture"
          ? fixture.document
          : {
              ...fixture.document,
              decorators: [],
              decoratorPresets: [],
              lastDecoratorChoices: {},
            };
      assert.equal((await owner.call({ kind: "open", document })).error, undefined);
      const before = documentArchive(owner.view.data);
      const breps = owner.view.data.bodies?.map((b) => b.brep);
      const batches =
        order === "pinion first"
          ? [[faces[0]], [faces[1]]]
          : order === "ring first"
            ? [[faces[1]], [faces[0]]]
            : [faces];
      for (const selection of batches) {
        assert.equal(
          (
            await owner.call({
              kind: "decorator",
              edit: {
                action: "apply",
                definition: gearDefinition,
                faces: selection,
              },
            })
          ).error,
          undefined,
        );
      }
      const gears = owner.view.data.decorators ?? [];
      assert.equal(gears.length, 2);
      assert.equal(gears[0].gearGroup, gears[1].gearGroup);
      const pinion = gears.find((g) => g.faces[0].body === faces[0].body);
      const ring = gears.find((g) => g !== pinion);
      assert.ok(pinion && ring);
      assert.equal(Number(ring.settings.teeth), 2 * Number(pinion.settings.teeth));
      assert.equal(pinion.gearPitchRadius, 5);
      assert.equal(ring.gearPitchRadius, 10);
      for (const gear of gears) {
        assert.equal(gear.problem, undefined);
        assert.equal(gearGroupProblem(owner.view.data, gear), null);
        assert.ok(toothTipWidth(gear, gear.gearPitchRadius ?? 0) >= 0.4 - 1e-9);
      }
      assert.ok(inspectGear(owner.view.data, ring).rootRadius <= 10.6 + 1e-9);
      assert.deepEqual(
        owner.view.data.bodies?.map((b) => b.brep),
        breps,
      );
      if (order === "ring first") await engagement(owner);
      if (order === "repair capture") {
        await engagement(owner);
        const repaired = documentArchive(owner.view.data);
        await owner.call({ kind: "undo" });
        assert.equal(documentArchive(owner.view.data), before);
        await owner.call({ kind: "redo" });
        assert.equal(documentArchive(owner.view.data), repaired);
      }
    } finally {
      owner.close();
    }
  });
}

test("captured gears refit tooth depth for larger print clearances and preserve physical units", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: {
            action: "apply",
            definition: gearDefinition,
            faces,
          },
        })
      ).error,
      undefined,
    );
    const before = documentArchive(owner.view.data);
    const ring = owner.view.data.decorators?.find((d) => d.faces[0].body === faces[1].body);
    assert.ok(ring);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: {
            action: "settings",
            ids: [ring.id],
            patch: { thinning: 0.1, rootClearance: 0.2 },
          },
        })
      ).error,
      undefined,
    );
    const gears = owner.view.data.decorators ?? [];
    assert.equal(Number(gears[1].settings.teeth), 2 * Number(gears[0].settings.teeth));
    for (const gear of gears) {
      assert.equal(gear.problem, undefined);
      assert.equal(gear.settings.thinning, 0.1);
      assert.equal(gear.settings.rootClearance, 0.2);
      assert.ok(Number(gear.settings.addendum) < 0.8);
      assert.ok(toothTipWidth(gear, gear.gearPitchRadius ?? 0) >= 0.4 - 1e-9);
      const d = inspectGear(owner.view.data, gear);
      assert.ok(
        Math.abs(
          Math.abs(d.rootRadius - d.pitchRadius) - Math.abs(d.tipRadius - d.pitchRadius) - 0.2,
        ) < 1e-9,
      );
    }
    await engagement(owner);
    const after = documentArchive(owner.view.data);
    await owner.call({ kind: "undo" });
    assert.equal(documentArchive(owner.view.data), before);
    await owner.call({ kind: "redo" });
    assert.equal(documentArchive(owner.view.data), after);
    assert.equal(
      (await owner.call({ kind: "open", document: readArchive(after) })).error,
      undefined,
    );
    assert.equal(documentArchive(owner.view.data), after);
  } finally {
    owner.close();
  }
});

async function engagement(owner: DocumentOwner) {
  const scope = new MeshScope(await initializeMeshRuntime());
  try {
    const gears = owner.view.data.decorators ?? [];
    const pinion = gears.find((g) => g.faces[0].body === faces[0].body);
    const ring = gears.find((g) => g !== pinion);
    assert.ok(pinion && ring);
    const prepared = await owner.call({ kind: "export-geometry" });
    assert.equal(prepared.error, undefined);
    assert.ok(prepared.exportDocument);
    const meshes = decoratedMeshes(await initializeMeshRuntime(), prepared.exportDocument);
    for (const mesh of meshes) validateMesh(mesh);
    for (const format of ["stl", "3mf"] as const)
      assert.ok(encodeMeshes(meshes, format).length > 1000);
    for (const quality of ["preview", "export", "body"] as const) {
      const bodies = owner.view.data.bodies ?? [];
      const a = scope.from(
        quality === "body"
          ? meshes[bodies.findIndex((b) => b.id === pinion.faces[0].body)]
          : gearMeshes(owner.view.data, pinion, quality).geometry.fill,
      );
      const b =
        quality === "body"
          ? scope.from(meshes[bodies.findIndex((b) => b.id === ring.faces[0].body)])
          : gearOperands(scope, owner.view.data, ring, quality).preview();
      for (let step = 0; step <= 24; step++) {
        const angle = (step * 360) / (24 * Number(pinion.settings.teeth));
        const moving = scope.keep(
          scope
            .keep(scope.keep(a.translate([-5, 0, 0])).rotate([0, 0, angle]))
            .translate([5, 0, 0]),
        );
        const rotating = scope.keep(b.rotate([0, 0, angle / 2]));
        const volume = scope.keep(moving.intersect(rotating)).volume();
        assert.ok(volume < 1e-5, `${quality} internal interference ${volume} at ${angle}`);
      }
    }
  } finally {
    scope.close();
  }
}
