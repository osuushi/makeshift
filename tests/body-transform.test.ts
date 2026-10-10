import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { SolidCalculator } from "../src/backend/solid-calculator.js";
import { bodyCenter } from "../src/model/body-placement.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";

test("rigid transform preserves topology identities; copies are independent, undoable and reopenable", async () => {
  const owner = new DocumentOwner();
  try {
    await createHoledBody(owner);
    const original = owner.view.data.bodies?.[0];
    assert.ok(original);
    assert.ok(Math.abs(original.center[0]) < 1e-9);
    const anchor = bodyCenter([original]);
    assert.ok(Math.abs(anchor[0]) < 1e-6, "Offset hole must not shift the default anchor");
    assert.ok(Math.abs(anchor[2] - 5) < 1e-6);
    const unequal = { ...original, volume: original.volume * 2, bounds: [10, -5, 0, 20, 5, 10] };
    assert.ok(Math.abs(bodyCenter([original, unequal])[0] - 7.5) < 1e-6);
    const transform = {
      ids: [original.id],
      axis: [1, 0, 0] as [number, number, number],
      angle: 90,
      pivot: [0, 0, 0] as [number, number, number],
      translation: [20, 30, 40] as [number, number, number],
      duplicate: false,
    };
    assert.equal((await owner.call({ kind: "transform-bodies", transform })).error, undefined);
    const moved = owner.view.data.bodies?.[0];
    assert.ok(moved);
    assert.equal(moved.id, original.id);
    assert.deepEqual(moved.faces.map((f) => f.id).sort(), original.faces.map((f) => f.id).sort());
    assert.deepEqual(moved.edges.map((e) => e.id).sort(), original.edges.map((e) => e.id).sort());
    for (const [actual, expected] of moved.center.map((v, i) => [v, [20, 25, 40][i]]))
      assert.ok(Math.abs(actual - expected) < 1e-9);
    assert.ok(Math.abs(moved.volume - original.volume) < 1e-7);
    const saved = owner.view.data;
    const invalid = await owner.call({
      kind: "transform-bodies",
      transform: { ...transform, ids: ["missing"] },
    });
    assert.ok(invalid.error);
    assert.deepEqual(owner.view.data, saved);
    assert.equal(
      (
        await owner.call({
          kind: "transform-bodies",
          transform: { ...transform, angle: 0, translation: [0, 0, 0], duplicate: true },
        })
      ).error,
      undefined,
    );
    const copies = owner.view.data.bodies;
    assert.ok(copies);
    assert.equal(copies.length, 2);
    const ids = new Set([
      moved.id,
      ...moved.faces.map((f) => f.id),
      ...moved.edges.map((e) => e.id),
    ]);
    assert.ok(
      [
        copies[1].id,
        ...copies[1].faces.map((f) => f.id),
        ...copies[1].edges.map((e) => e.id),
      ].every((id) => !ids.has(id)),
    );
    assert.equal((await owner.call({ kind: "undo" })).view.data.bodies?.length, 1);
    assert.equal((await owner.call({ kind: "redo" })).view.data.bodies?.length, 2);
    const document = JSON.parse(JSON.stringify(owner.view.data));
    await owner.call({ kind: "new" });
    assert.equal((await owner.call({ kind: "open", document })).error, undefined);
    assert.deepEqual(
      owner.view.data.bodies?.map((b) => b.id),
      copies.map((b) => b.id),
    );
    for (const body of owner.view.data.bodies ?? []) {
      assert.deepEqual(
        body.faces.map((f) => f.id),
        copies.find((b) => b.id === body.id)?.faces.map((f) => f.id),
      );
      assert.ok(Math.abs(body.center[2] - 40) < 1e-9);
    }
  } finally {
    owner.close();
  }
});

async function createHoledBody(owner: DocumentOwner) {
  const sketch = {
    ...emptySketch(planes.XY),
    curves: [
      {
        id: "outer",
        kind: "circle" as const,
        center: { x: 0, y: 0 },
        radius: 5,
        construction: false,
      },
      {
        id: "hole",
        kind: "circle" as const,
        center: { x: 1, y: 0 },
        radius: 1,
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
          distance: 10,
          mode: "new",
        },
      })
    ).error,
    undefined,
  );
  await owner.call({ kind: "accept" });
}

test("mass center is on demand, cached by exact geometry and independent of model history", async () => {
  const owner = new DocumentOwner();
  const kernel = new SolidCalculator();
  const calculate = mock.method(kernel, "calculate");
  try {
    await createHoledBody(owner);
    const original = owner.view.data.bodies?.[0];
    assert.ok(original);
    const before = owner.view.data;
    const history = (await owner.call({ kind: "read-history" })).history;
    const mass = await owner.call({ kind: "center-of-mass", body: original.id });
    assert.equal(mass.error, undefined);
    assert.ok(mass.centerOfMass);
    assert.ok(Math.abs(mass.centerOfMass[0] + 1 / 24) < 1e-9);
    assert.ok(Math.abs(original.center[0]) < 1e-9, "anchor differs from material center");
    assert.equal(owner.view.data, before);
    assert.deepEqual((await owner.call({ kind: "read-history" })).history, history);
    const [first, second] = await Promise.all([
      kernel.centerOfMass(original),
      kernel.centerOfMass({ ...original, id: "different-id" }),
    ]);
    assert.deepEqual(first, mass.centerOfMass);
    assert.deepEqual(second, first);
    assert.equal(calculate.mock.callCount(), 1, "identical BRep shares in-flight calculation");
    first[0] = 123;
    assert.deepEqual(await kernel.centerOfMass(original), second, "caller cannot poison cache");
    await owner.call({
      kind: "transform-bodies",
      transform: {
        ids: [original.id],
        axis: [0, 0, 1],
        angle: 0,
        pivot: [0, 0, 0],
        translation: [7, 0, 0],
        duplicate: false,
      },
    });
    const moved = owner.view.data.bodies?.[0];
    assert.ok(moved);
    const movedMass = await kernel.centerOfMass(moved);
    assert.ok(Math.abs(movedMass[0] - (7 - 1 / 24)) < 1e-9);
    assert.equal(calculate.mock.callCount(), 2, "same ID with changed BRep recomputes");
    owner.beginScript("mass center query");
    assert.deepEqual(
      await owner.scripts.step({ kind: "centerOfMass", input: { body: moved.id } }),
      { centerOfMass: movedMass },
    );
    assert.equal(owner.scripts.finish(), false);
    const invalid = { ...original, brep: "invalid" };
    await assert.rejects(kernel.centerOfMass(invalid));
    await assert.rejects(kernel.centerOfMass(invalid));
    assert.equal(calculate.mock.callCount(), 4, "failed queries are retried");
  } finally {
    calculate.mock.restore();
    kernel.close();
    owner.close();
  }
});
