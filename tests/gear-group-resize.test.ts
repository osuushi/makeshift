import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { gearGroupProblem } from "../src/decorators/gear-group.js";
import { toothTipWidth } from "../src/decorators/gear-group-fit.js";
import { gearDefinition } from "../src/decorators/gear-settings.js";
import { inspectGear } from "../src/decorators/gear-support.js";
import { decoratedMeshes, initializeMeshRuntime } from "../src/decorators/mesh-runtime.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";
import { validateMesh } from "../src/model/export-mesh.js";
import { encodeMeshes } from "../src/model/mesh-export.js";
import type { SketchDocument } from "../src/sketch/document.js";
import { assertGearEngagement } from "./gear-group-engagement.js";
import { captured, checkPair, geometryArchive } from "./gear-group-fixture.js";

test("native cylinder resize refits a compatible group without constraining its axis spacing", async () => {
  const owner = new DocumentOwner();
  try {
    const fixture: { document: SketchDocument } = JSON.parse(
      await readFile("tests/fixtures/gear-cylinders.json", "utf8"),
    );
    const faces = fixture.document.decorators?.flatMap((d) => d.faces) ?? [];
    assert.equal(
      (await owner.call({ kind: "open", document: { ...fixture.document, decorators: [] } })).error,
      undefined,
    );
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: { action: "apply", definition: "freac.gear", faces },
        })
      ).error,
      undefined,
    );
    const before = documentArchive(owner.view.data);
    const originals = owner.view.data.bodies ?? [];
    const other = originals.find((b) => b.id === faces[1].body);
    assert.ok(other);
    assert.equal(
      (await owner.call({ kind: "offset-faces", operation: { faces: [faces[0]], distance: 0.02 } }))
        .error,
      undefined,
    );
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    let data = owner.view.data;
    assert.ok(
      Math.abs(
        (data.bodies?.find((b) => b.id === faces[0].body)?.faces.find((f) => f.id === faces[0].face)
          ?.cylinder?.radius ?? 0) - 13.02,
      ) < 1e-8,
    );
    assert.equal(data.bodies?.find((b) => b.id === other.id)?.brep, other.brep);
    for (const gear of data.decorators ?? []) assert.equal(gearGroupProblem(data, gear), null);
    const after = documentArchive(data);
    await owner.call({ kind: "undo" });
    assert.equal(documentArchive(owner.view.data), before);
    await owner.call({ kind: "redo" });
    assert.equal(documentArchive(owner.view.data), after);
    assert.equal(
      (await owner.call({ kind: "open", document: readArchive(after) })).error,
      undefined,
    );
    const reopened = documentArchive(owner.view.data);
    assert.equal(
      (await owner.call({ kind: "offset-faces", operation: { faces: [faces[0]], distance: 0.25 } }))
        .error,
      undefined,
    );
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    data = owner.view.data;
    for (const gear of data.decorators ?? []) assert.equal(gear.problem, undefined);
    const warned = documentArchive(data);
    const breps = data.bodies?.map((b) => b.brep);
    const ids = (data.decorators ?? []).map((g) => g.id);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: { action: "settings", ids, patch: { diameterTolerance: 1 } },
        })
      ).error,
      undefined,
    );
    data = owner.view.data;
    assert.deepEqual(
      data.bodies?.map((b) => b.brep),
      breps,
    );
    verifyFit(data);
    await assertGearEngagement(data, "export");
    await verifyExport(owner);
    await owner.call({ kind: "undo" });
    assert.equal(documentArchive(owner.view.data), warned);
    await owner.call({ kind: "undo" });
    assert.equal(documentArchive(owner.view.data), reopened);
  } finally {
    owner.close();
  }
});

function verifyFit(data: SketchDocument) {
  const gears = data.decorators ?? [];
  const modules = gears.map((g) => inspectGear(data, g).normalModule);
  assert.ok(Math.abs(modules[0] - modules[1]) < 1e-10);
  assert.ok(gears.some((g) => g.settings.teeth !== 39 && g.settings.teeth !== 21));
  for (const gear of gears) {
    assert.equal(gear.problem, undefined);
    assert.equal(gearGroupProblem(data, gear), null);
    const radius = gear.gearPitchRadius ?? 0;
    assert.ok(toothTipWidth(gear, radius) >= 0.4 - 1e-8);
    const support =
      data.bodies
        ?.find((b) => b.id === gear.faces[0].body)
        ?.faces.find((f) => f.id === gear.faces[0].face)?.cylinder?.radius ?? 0;
    assert.ok(2 * Math.abs(radius - support) <= 1 + 1e-8);
  }
  assert.ok(
    Math.abs((gears[0].gearPitchRadius ?? 0) + (gears[1].gearPitchRadius ?? 0) - 20) > 0.01,
    "Fitted sizes follow edited diameters, not the old axis spacing",
  );
}

async function verifyExport(owner: DocumentOwner) {
  const reply = await owner.call({ kind: "export-geometry" });
  assert.equal(reply.error, undefined);
  assert.ok(reply.exportDocument);
  const meshes = decoratedMeshes(await initializeMeshRuntime(), reply.exportDocument);
  for (const mesh of meshes) validateMesh(mesh);
  for (const format of ["3mf", "stl"] as const)
    assert.ok(encodeMeshes(meshes, format).length > 1000);
}

test("printing limits persist through failed fits and repair the entire group atomically", async () => {
  const owner = new DocumentOwner();
  try {
    const faces = await captured(owner);
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
    const gears = checkPair(owner);
    const before = documentArchive(owner.view.data);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: {
            action: "settings",
            ids: [gears[1].id],
            patch: { minimumTooth: 10 },
          },
        })
      ).error,
      undefined,
    );
    const warned = documentArchive(owner.view.data);
    assert.match(
      (await owner.call({ kind: "export-geometry" })).error ?? "",
      /Gear group cannot fit/,
    );
    for (const gear of owner.view.data.decorators ?? []) {
      assert.equal(gear.settings.minimumTooth, 10);
      assert.match(gear.problem ?? "", /Gear group cannot fit/);
    }
    assert.equal(geometryArchive(owner.view.data), geometryArchive(readArchive(before)));
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: {
            action: "settings",
            ids: [gears[1].id],
            patch: { minimumTooth: 0.4, rootClearance: 0.2 },
          },
        })
      ).error,
      undefined,
    );
    checkPair(owner);
    for (const gear of owner.view.data.decorators ?? [])
      assert.equal(gear.settings.rootClearance, 0.2);
    await owner.call({ kind: "undo" });
    assert.equal(documentArchive(owner.view.data), warned);
    await owner.call({ kind: "undo" });
    assert.equal(documentArchive(owner.view.data), before);
  } finally {
    owner.close();
  }
});
