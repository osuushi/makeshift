import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";
import { emptySketch, type Sketch } from "../src/sketch/document.js";
import { rectangle, segment } from "../src/sketch/geometry.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";
import { extrude, fixture } from "./face-cut-fixtures.js";

for (const mode of ["split", "imprint"] as const) {
  test(`${mode}: located cylinder support extends beyond reference face; preview, history and archive preserve geometry`, async () => {
    const owner = new DocumentOwner();
    try {
      const { target, cutter, surface } = await fixture(owner);
      const cap = target.faces.find((face) => face.plane?.origin[2] === 20);
      assert.ok(cap);
      const before = owner.view.data;
      const operation = {
        mode,
        targets: [{ body: target.id, ...(mode === "imprint" ? { faces: [cap.id] } : {}) }],
        surface,
      };
      assert.equal((await owner.call({ kind: "plane-cut", operation })).error, undefined);
      assert.deepEqual(owner.view.data, before);
      const result = owner.view.candidate?.bodies;
      assert.ok(result);
      assert.equal(result.length, mode === "split" ? 3 : 2);
      assert.equal(result.find((body) => body.id === cutter.id)?.brep, cutter.brep);
      const changed = result.filter((body) => body.id !== cutter.id);
      assert.ok(Math.abs(changed.reduce((total, body) => total + body.volume, 0) - 8000) < 1e-6);
      if (mode === "split") {
        const core = changed.find((body) => Math.abs(body.volume - Math.PI * 25 * 20) < 1e-6);
        assert.ok(core, "Exact cylindrical core has independently expected volume");
        assert.ok(Math.abs(core.center[0] - 3) < 1e-6);
      } else {
        assert.equal(changed[0].id, target.id);
        assert.equal(changed[0].faces.length, 7);
        for (const face of target.faces.filter((face) => face.id !== cap.id))
          assert.ok(changed[0].faces.some((next) => next.id === face.id));
      }
      await owner.call({ kind: "discard" });
      assert.deepEqual(owner.view.data, before);
      assert.equal((await owner.call({ kind: "plane-cut", operation })).error, undefined);
      await owner.call({ kind: "accept" });
      const accepted = owner.view.data;
      await owner.call({ kind: "undo" });
      assert.deepEqual(owner.view.data, before);
      await owner.call({ kind: "redo" });
      assert.deepEqual(owner.view.data, accepted);
      assert.equal(
        (await owner.call({ kind: "open", document: readArchive(documentArchive(accepted)) }))
          .error,
        undefined,
      );
      assert.deepEqual(
        owner.view.data.bodies?.map((body) => body.edges.map((edge) => edge.id)),
        accepted.bodies?.map((body) => body.edges.map((edge) => edge.id)),
      );
    } finally {
      owner.close();
    }
  });
}

test("face cuts reject missing/ambiguous references atomically and leave disjoint or coincident references unchanged", async () => {
  const owner = new DocumentOwner();
  try {
    const { target, cutter, surface } = await fixture(owner);
    const before = owner.view.data;
    for (const reference of [
      { surface: { ...surface, face: "missing" } },
      { surface, frame: planes.XY },
      {},
    ]) {
      assert.ok(
        (
          await owner.call({
            kind: "plane-cut",
            operation: { mode: "split", targets: [{ body: target.id }], ...reference },
          })
        ).error,
      );
      assert.deepEqual(owner.view.data, before);
      assert.equal(owner.view.candidate, null);
    }
    const cap = cutter.faces.find((face) => face.plane);
    assert.ok(cap);
    assert.equal(
      (
        await owner.call({
          kind: "plane-cut",
          operation: {
            mode: "split",
            targets: [{ body: target.id }],
            surface: { body: cutter.id, face: cap.id },
          },
        })
      ).error,
      undefined,
    );
    assert.deepEqual(owner.view.candidate, before);
    await owner.call({ kind: "discard" });
    for (const mode of ["split", "imprint"] as const) {
      assert.equal(
        (
          await owner.call({
            kind: "plane-cut",
            operation: {
              mode,
              targets: [{ body: cutter.id }],
              surface,
            },
          })
        ).error,
        undefined,
      );
      assert.deepEqual(owner.view.candidate, before);
      await owner.call({ kind: "discard" });
    }
  } finally {
    owner.close();
  }
});

for (const mode of ["split", "imprint"] as const) {
  test(`${mode}: spherical support intersects a planar cap without a tangent-plane approximation`, async () => {
    const owner = new DocumentOwner();
    try {
      const target = await extrude(
        owner,
        rectangle(emptySketch(planes.XY), { x: -10, y: -10 }, { x: 10, y: 10 }).sketch,
        20,
      );
      const sketch: Sketch = {
        ...emptySketch({ ...planes.XZ, origin: [0, 0, 20] }),
        curves: [
          {
            id: "arc",
            kind: "arc",
            a: { x: 0, y: -5 },
            b: { x: 0, y: 5 },
            bulge: 1,
            construction: false,
          },
          segment({ x: 0, y: 5 }, { x: 0, y: -5 }),
        ],
      };
      assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
      assert.equal(
        (
          await owner.call({
            kind: "revolve",
            revolution: {
              sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
              axis: { origin: [0, 0, 20], direction: [0, 0, 1] },
              angle: 360,
              height: 0,
              mode: "new",
            },
          })
        ).error,
        undefined,
      );
      await owner.call({ kind: "accept" });
      const sphere = owner.view.data.bodies?.at(-1);
      assert.ok(sphere);
      const face = sphere.faces.find((face) => face.sphere);
      const cap = target.faces.find((face) => face.plane?.origin[2] === 20);
      assert.ok(face && cap);
      assert.equal(
        (
          await owner.call({
            kind: "plane-cut",
            operation: {
              mode,
              targets: [{ body: target.id, ...(mode === "imprint" ? { faces: [cap.id] } : {}) }],
              surface: { body: sphere.id, face: face.id },
            },
          })
        ).error,
        undefined,
      );
      const changed = owner.view.candidate?.bodies?.filter((body) => body.id !== sphere.id);
      assert.ok(changed);
      assert.equal(changed.length, mode === "split" ? 2 : 1);
      assert.ok(Math.abs(changed.reduce((sum, body) => sum + body.volume, 0) - 8000) < 1e-6);
      if (mode === "split")
        assert.ok(changed.some((body) => Math.abs(body.volume - (2 / 3) * Math.PI * 125) < 1e-6));
      else assert.equal(changed[0].faces.length, 7);
    } finally {
      owner.close();
    }
  });
}
