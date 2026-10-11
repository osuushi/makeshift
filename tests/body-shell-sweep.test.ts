import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body, BodyShell } from "../src/model/body.js";
import { emptySketch, type SketchDocument } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";
import { shell } from "./shell-fixtures.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/shell-bent-sweep.json", "utf8")) as {
  document: SketchDocument;
  operation: BodyShell;
};
const openings = fixture.operation.selection[0].faces;
async function open(owner: DocumentOwner): Promise<Body> {
  assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
  const body = owner.view.data.bodies?.[0];
  assert.ok(body);
  return body;
}
async function probe(owner: DocumentOwner, x: number, y: number, z: number, occupied: boolean) {
  const sketch = {
    ...emptySketch({ ...planes.XY, origin: [0, 0, z - 0.05] }),
    curves: [
      { id: "probe", kind: "circle" as const, center: { x, y }, radius: 0.05, construction: false },
    ],
  };
  assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
  const reply = await owner.call({
    kind: "extrude",
    extrusion: {
      sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
      distance: 0.1,
      mode: "intersect",
      targets: [owner.view.data.bodies?.[0].id as string],
    },
  });
  assert.equal(reply.error, undefined);
  const bodies = reply.view.candidate?.bodies ?? [];
  assert.equal(bodies.length, occupied ? 1 : 0, `Material at ${x}, ${y}, ${z}`);
  if (occupied) assert.ok(Math.abs(bodies[0].volume - Math.PI * 0.05 ** 2 * 0.1) < 1e-9);
  await owner.call({ kind: "discard" });
}

test("captured spline sweep shells both openings without changing source or retained identities", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await open(owner);
    const before = owner.view.data;
    for (const thickness of [-0.5, -1, -2, 1]) {
      const result = await shell(owner, body, thickness, openings);
      assert.equal(owner.view.data, before);
      assert.ok(result.volume > 0 && result.volume < body.volume);
      for (const face of body.faces.filter((f) => !openings.includes(f.id)))
        assert.ok(result.faces.some((f) => f.id === face.id));
      for (const radius of [8, 8 + thickness])
        assert.equal(
          result.faces.filter((f) => Math.abs((f.cylinder?.radius ?? 0) - radius) < 1e-6).length,
          2,
        );
      await owner.call({ kind: "discard" });
      assert.equal(owner.view.data.bodies?.[0].brep, body.brep);
    }
    await shell(owner, body, -1, openings);
    for (const thickness of [-8, -10, 12]) {
      const rejected = await owner.call({
        kind: "shell",
        operation: { ...fixture.operation, thickness },
      });
      assert.ok(rejected.error);
      assert.equal(rejected.view.candidate, null);
      assert.equal(rejected.view.data, before);
      assert.ok((await owner.call({ kind: "accept" })).error);
    }
  } finally {
    owner.close();
  }
});

test("captured shell has an open bore and signed one-millimeter walls through the bend", async () => {
  const owner = new DocumentOwner();
  try {
    for (const thickness of [-1, 1]) {
      const body = await open(owner);
      await shell(owner, body, thickness, openings);
      assert.equal((await owner.call({ kind: "accept" })).error, undefined);
      // Independent solid intersections through both straight legs and the bend.
      // Test the stored exact result, not its mesh or validation samples.
      const inner = Math.min(8, 8 + thickness),
        outer = Math.max(8, 8 + thickness);
      for (const [x, y] of [
        [-15, 5],
        [0, 15.858],
        [15, 5],
      ]) {
        await probe(owner, x, y, 0, false);
        await probe(owner, x, y, inner - 0.2, false);
        await probe(owner, x, y, inner + 0.2, true);
        await probe(owner, x, y, outer - 0.2, true);
        await probe(owner, x, y, outer + 0.2, false);
      }
      for (const x of [-20, 20]) await probe(owner, x, 0, 0, false);
    }
  } finally {
    owner.close();
  }
});

test("captured sweep retains rounded cap fallback and rejects invalid inward closures", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await open(owner);
    for (const thickness of [-1, 1]) {
      const both = await shell(owner, body, thickness, openings);
      for (const face of thickness < 0 ? openings.slice(0, 1) : openings) {
        const wall = await shell(owner, body, thickness, [face]);
        assert.ok(wall.volume > both.volume);
        if (thickness < 0) assert.ok(Math.abs(wall.volume - both.volume - Math.PI * 7 ** 2) < 1e-5);
        if (thickness > 0) {
          // Sharp construction fails for this end cap. The rounded fallback
          // adds the circular cap slab and its quarter-torus/spherical rim.
          const capVolume = 64 * Math.PI + 4 * Math.PI ** 2 + (2 * Math.PI) / 3;
          assert.ok(Math.abs(wall.volume - both.volume - capVolume) < 1e-5);
        }
        const retainedCap = openings.find((id) => id !== face);
        assert.ok(wall.faces.some((f) => f.id === retainedCap));
      }
    }
    const closed = await shell(owner, body, 1);
    for (const face of body.faces) assert.ok(closed.faces.some((f) => f.id === face.id));
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    for (const x of [-20, 20]) {
      const outward = Math.sign(x) * 0.35;
      await probe(owner, x + outward, -0.35, 0, true);
    }
    await probe(owner, 0, 15.858, 0, false);
    await open(owner);
    const before = owner.view.data;
    for (const faces of [[], openings.slice(1)]) {
      await shell(owner, body, -1, openings);
      const reply = await owner.call({
        kind: "shell",
        operation: {
          thickness: -1,
          selection: [{ body: body.id, faces }],
        },
      });
      assert.match(
        reply.error ?? "",
        /invalid boundaries or surface geometry|boundary does not meet its incident surfaces/,
      );
      assert.equal(reply.view.candidate, null);
      assert.equal(reply.view.data, before);
      assert.ok((await owner.call({ kind: "accept" })).error);
    }
  } finally {
    owner.close();
  }
});

test("captured spline shell preserves Undo, reopened topology and rigid placement", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await open(owner);
    const before = owner.view.data;
    const wall = await shell(owner, body, -1, openings);
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const after = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, after);
    assert.equal((await owner.call({ kind: "open", document: after })).error, undefined);
    assert.deepEqual(
      owner.view.data.bodies?.[0].faces.map((f) => f.id),
      wall.faces.map((f) => f.id),
    );
    await open(owner);
    assert.equal(
      (
        await owner.call({
          kind: "transform-bodies",
          transform: {
            ids: [body.id],
            axis: [1, 2, 3],
            pivot: [0, 0, 0],
            angle: 57,
            translation: [20, -30, 40],
            duplicate: false,
          },
        })
      ).error,
      undefined,
    );
    const moved = owner.view.data.bodies?.[0];
    assert.ok(moved);
    const result = await shell(owner, moved, -1, openings);
    assert.ok(Math.abs(result.volume - wall.volume) < 1e-5);
  } finally {
    owner.close();
  }
});
