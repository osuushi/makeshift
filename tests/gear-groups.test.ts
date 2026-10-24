import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { matchGearApplication } from "../src/decorators/gear-group.js";
import { fitGearGroup, toothTipWidth } from "../src/decorators/gear-group-fit.js";
import { gearDefinition } from "../src/decorators/gear-settings.js";
import { decoratedMeshes, initializeMeshRuntime } from "../src/decorators/mesh-runtime.js";
import { MeshScope } from "../src/decorators/mesh-scope.js";
import type { DecoratorInstance } from "../src/decorators/types.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";
import { validateMesh } from "../src/model/export-mesh.js";
import { encodeMeshes } from "../src/model/mesh-export.js";
import { assertGearEngagement } from "./gear-group-engagement.js";
import { captured, checkPair, geometryArchive } from "./gear-group-fixture.js";

for (const order of ["together", "large first", "small first", "legacy"] as const) {
  test(`captured 13/7 pitch cylinders match when applied ${order}`, async () => {
    const owner = new DocumentOwner();
    try {
      const faces = await captured(owner, order === "legacy");
      const before = geometryArchive(owner.view.data);
      const selections =
        order === "together" || order === "legacy"
          ? [faces]
          : (order === "large first" ? faces : [...faces].reverse()).map((f) => [f]);
      for (const selection of selections) {
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
      const gears = checkPair(owner);
      assert.equal(geometryArchive(owner.view.data), before);
      const after = documentArchive(owner.view.data);
      await owner.call({ kind: "undo" });
      assert.notEqual(documentArchive(owner.view.data), after);
      await owner.call({ kind: "redo" });
      assert.equal(documentArchive(owner.view.data), after);
      assert.equal(
        (await owner.call({ kind: "open", document: readArchive(after) })).error,
        undefined,
      );
      assert.deepEqual(owner.view.data.decorators, JSON.parse(JSON.stringify(gears)));
    } finally {
      owner.close();
    }
  });
}

test("captured gear preview and exported bodies engage through a complete tooth period", async () => {
  const owner = new DocumentOwner();
  const runtime = await initializeMeshRuntime();
  const scope = new MeshScope(runtime);
  try {
    const faces = await captured(owner);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: { action: "apply", definition: gearDefinition, faces },
        })
      ).error,
      undefined,
    );
    const gears = checkPair(owner);
    for (const quality of ["preview", "export"] as const)
      await assertGearEngagement(owner.view.data, quality);
    const prepared = await owner.call({ kind: "export-geometry" });
    assert.equal(prepared.error, undefined);
    assert.ok(prepared.exportDocument);
    const meshes = decoratedMeshes(runtime, prepared.exportDocument);
    for (const mesh of meshes) validateMesh(mesh);
    for (const format of ["stl", "3mf"] as const)
      assert.ok(encodeMeshes(meshes, format).length > 1000);
    const pair = gears.map((g) =>
      scope.from(meshes[(owner.view.data.bodies ?? []).findIndex((b) => b.id === g.faces[0].body)]),
    );
    assert.ok(scope.keep(pair[0].intersect(pair[1])).volume() < 1e-5);
  } finally {
    scope.close();
    owner.close();
  }
});

test("explicit group additions, shared sizing and rejection remain atomic", async () => {
  const owner = new DocumentOwner();
  try {
    const faces = await captured(owner);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: { action: "apply", definition: gearDefinition, faces: [faces[0]] },
        })
      ).error,
      undefined,
    );
    const first = owner.view.data.decorators?.[0];
    assert.ok(first?.gearGroup);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: {
            action: "apply",
            definition: gearDefinition,
            faces: [faces[1]],
            gearGroup: first.gearGroup,
          },
        })
      ).error,
      undefined,
    );
    const gears = checkPair(owner);
    const before = documentArchive(owner.view.data);
    assert.match(
      (
        await owner.call({
          kind: "decorator",
          edit: { action: "apply", definition: gearDefinition, faces, gearGroup: "missing" },
        })
      ).error ?? "",
      /existing gear group/,
    );
    assert.equal(documentArchive(owner.view.data), before);
    assert.match(
      (
        await owner.call({
          kind: "decorator",
          edit: {
            action: "settings",
            ids: gears.map((g) => g.id),
            patch: { module: 0.5 },
          },
        })
      ).error ?? "",
      /minimum tooth tip width/,
    );
    assert.equal(documentArchive(owner.view.data), before);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: {
            action: "settings",
            ids: gears.map((g) => g.id),
            patch: { module: 0.5, minimumTooth: 0.3 },
          },
        })
      ).error,
      undefined,
    );
    assert.deepEqual(
      owner.view.data.decorators?.map((g) => g.settings.teeth),
      [52, 28],
    );
    await owner.call({ kind: "undo" });
    assert.equal(documentArchive(owner.view.data), before);
    assert.equal(
      (await owner.call({ kind: "decorator", edit: { action: "remove", faces: [faces[1]] } }))
        .error,
      undefined,
    );
    assert.equal(owner.view.data.decorators?.length, 1);
    await owner.call({ kind: "undo" });
    assert.equal(documentArchive(owner.view.data), before);
  } finally {
    owner.close();
  }
});

test("noncommensurate radii fit within explicit diameter and printable width limits", async () => {
  const owner = new DocumentOwner();
  try {
    const faces = await captured(owner, true);
    const data = owner.view.data;
    const bodies = data.bodies?.map((b) => ({
      ...b,
      faces: b.faces.map((f) =>
        f.id === faces[1].face && f.cylinder
          ? { ...f, cylinder: { ...f.cylinder, radius: 7.013 } }
          : f,
      ),
    }));
    const gears: DecoratorInstance[] = [...(data.decorators ?? [])];
    const matched = matchGearApplication(
      { ...data, bodies },
      gears,
      new Set(gears.map((g) => g.id)),
    );
    const modules = matched.map((g) => (2 * (g.gearPitchRadius ?? 0)) / Number(g.settings.teeth));
    assert.ok(Math.abs(modules[0] - modules[1]) < 1e-10);
    for (const gear of matched) {
      const target =
        bodies
          ?.find((b) => b.id === gear.faces[0].body)
          ?.faces.find((f) => f.id === gear.faces[0].face)?.cylinder?.radius ?? 0;
      assert.ok(Math.abs(2 * ((gear.gearPitchRadius ?? 0) - target)) <= 0.2 + 1e-9);
      assert.ok(toothTipWidth(gear, gear.gearPitchRadius ?? 0) >= 0.4 - 1e-9);
    }
    const strict = gears.map((g) => ({ ...g, settings: { ...g.settings, diameterTolerance: 0 } }));
    assert.throws(() => fitGearGroup({ ...data, bodies }, strict), /cannot fit/);
  } finally {
    owner.close();
  }
});

test("automatic gear defaults enforce printable sizing and retain impossible groups for repair", async () => {
  const owner = new DocumentOwner();
  try {
    const faces = await captured(owner);
    const bodies = documentArchive(owner.view.data);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: { action: "apply", definition: gearDefinition, faces: [faces[0]] },
        })
      ).error,
      undefined,
    );
    const single = owner.view.data.decorators?.[0];
    assert.ok(single);
    assert.ok(toothTipWidth(single, single.gearPitchRadius ?? 13) >= 0.4);
    await owner.call({ kind: "undo" });
    assert.equal(documentArchive(owner.view.data), bodies);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: {
            action: "apply",
            definition: gearDefinition,
            faces,
            settings: { minimumTooth: 10 },
          },
        })
      ).error,
      undefined,
    );
    const gears = owner.view.data.decorators ?? [];
    assert.equal(gears.length, 2);
    for (const gear of gears) assert.match(gear.problem ?? "", /Gear group cannot fit/);
    assert.equal(geometryArchive(owner.view.data), geometryArchive(readArchive(bodies)));
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: { action: "settings", ids: gears.map((g) => g.id), patch: { minimumTooth: 0.4 } },
        })
      ).error,
      undefined,
    );
    checkPair(owner);
  } finally {
    owner.close();
  }
});
