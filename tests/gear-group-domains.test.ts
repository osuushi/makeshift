import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { gearGroupProblem } from "../src/decorators/gear-group.js";
import { decoratedMeshes, initializeMeshRuntime } from "../src/decorators/mesh-runtime.js";
import { validateMesh } from "../src/model/export-mesh.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";
import { retainHalf, roundBody } from "./decorator-domain-fixtures.js";

test("separated partial gears share compatible full-revolution profiles and export closed sectors", async () => {
  const owner = new DocumentOwner();
  try {
    const full = await roundBody(owner, [10]);
    const partial = await retainHalf(owner, full, planes.YZ, (b) => b.center[0] < 0);
    const other = await roundBody(owner, [7]);
    assert.equal(
      (
        await owner.call({
          kind: "transform-bodies",
          transform: {
            ids: [other.id],
            pivot: [0, 0, 0],
            axis: [0, 0, 1],
            angle: 1,
            translation: [50, 30, 20],
            duplicate: false,
          },
        })
      ).error,
      undefined,
    );
    const faces = (owner.view.data.bodies ?? []).flatMap((b) =>
      b.faces.filter((f) => f.cylinder).map((f) => ({ body: b.id, face: f.id })),
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
    const gears = owner.view.data.decorators ?? [];
    assert.equal(gears.length, 2);
    assert.equal(gears[0].gearGroup, gears[1].gearGroup);
    for (const gear of gears) assert.equal(gearGroupProblem(owner.view.data, gear), null);
    assert.ok(
      Math.abs(
        (2 * (gears[0].gearPitchRadius ?? 0)) / Number(gears[0].settings.teeth) -
          (2 * (gears[1].gearPitchRadius ?? 0)) / Number(gears[1].settings.teeth),
      ) < 1e-10,
    );
    const reply = await owner.call({ kind: "export-geometry" });
    assert.equal(reply.error, undefined);
    assert.ok(reply.exportDocument);
    const meshes = decoratedMeshes(await initializeMeshRuntime(), reply.exportDocument);
    for (const mesh of meshes) validateMesh(mesh);
    const sector = meshes[(owner.view.data.bodies ?? []).findIndex((b) => b.id === partial.id)];
    assert.ok(sector.vertices.every(([x]) => x < 0.00001));
  } finally {
    owner.close();
  }
});

test("different cylinders on one compound body can belong to independent gear groups", async () => {
  const owner = new DocumentOwner();
  try {
    await roundBody(owner, [13], 5);
    const sketch = {
      ...emptySketch({ ...planes.XY, origin: [0, 0, 5] }),
      curves: [
        {
          id: "upper",
          kind: "circle" as const,
          center: { x: 0, y: 0 },
          radius: 7,
          construction: false,
        },
      ],
    };
    assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
    assert.equal(
      (
        await owner.call({
          kind: "extrude",
          extrusion: {
            sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
            distance: 5,
            mode: "auto",
          },
        })
      ).error,
      undefined,
    );
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    assert.equal(owner.view.data.bodies?.length, 1);
    const body = owner.view.data.bodies[0];
    const faces = body.faces.filter((f) => f.cylinder).map((f) => ({ body: body.id, face: f.id }));
    assert.equal(faces.length, 2);
    for (const face of faces)
      assert.equal(
        (
          await owner.call({
            kind: "decorator",
            edit: { action: "apply", definition: "freac.gear", faces: [face] },
          })
        ).error,
        undefined,
      );
    const gears = owner.view.data.decorators ?? [];
    assert.notEqual(gears[0].gearGroup, gears[1].gearGroup);
    assert.notEqual(gears[0].gearColor, gears[1].gearColor);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: { action: "settings", ids: [gears[0].id], patch: { minimumTooth: 10 } },
        })
      ).error,
      undefined,
    );
    assert.match(owner.view.data.decorators?.[0].problem ?? "", /Gear group cannot fit/);
    assert.deepEqual(owner.view.data.decorators?.[1], gears[1]);
  } finally {
    owner.close();
  }
});
