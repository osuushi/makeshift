import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body, Face } from "../src/model/body.js";
import { exportBodies } from "../src/model/mesh-export.js";
import type { SketchDocument } from "../src/sketch/document.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/offset-coplanar-contact.json", "utf8")) as {
  document: SketchDocument;
  floor: string;
  rim: string;
};
const gap = 0.0009765625;
const area = 923.5071357810101; // Captured bottom footprint; prism volume = area × height.
const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);
function top(body: Body): Face {
  const face = body.faces.find((f) => f.plane && f.plane.origin[2] > 1);
  assert.ok(face);
  return face;
}
async function offset(owner: DocumentOwner, face: string, distance: number) {
  const body = owner.view.data.bodies?.[0];
  assert.ok(body);
  const reply = await owner.call({
    kind: "offset-faces",
    operation: {
      faces: [{ body: body.id, face }],
      distance,
    },
  });
  assert.equal(reply.error, undefined);
  assert.equal(
    reply.view.offsetDistance,
    distance,
    "Do not stop a binary-search step before contact",
  );
  const result = reply.view.candidate?.bodies?.[0];
  assert.ok(result);
  return { result, selection: reply.view.offsetSelection };
}

test("captured near-coplanar floor merges exactly and continues past its rim", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const before = owner.view.data;
    for (const distance of [gap, 1, 5]) {
      const { result, selection } = await offset(owner, fixture.floor, distance);
      const height = 24 - gap + distance;
      assert.equal(result.faces.length, 7, "Five outer walls and two caps; no residual inner wall");
      assert.equal(result.faces.filter((f) => f.plane).length, 2);
      close(top(result).plane?.origin[2] ?? NaN, height);
      close(result.volume, area * height);
      assert.notEqual(top(result).id, fixture.floor, "Merged face has a new identity");
      assert.notEqual(top(result).id, fixture.rim);
      assert.deepEqual(selection, [{ body: result.id, face: top(result).id }]);
      for (const format of ["stl", "3mf"] as const)
        assert.ok(exportBodies([result], format).length);
      assert.equal(owner.view.data, before);
      await owner.call({ kind: "discard" });
    }
    const { result } = await offset(owner, fixture.floor, gap);
    await owner.call({ kind: "accept" });
    const after = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, after);
    assert.equal((await owner.call({ kind: "open", document: after })).error, undefined);
    const further = await offset(owner, top(result).id, 2);
    close(further.result.volume, area * 26);
    close(top(further.result).plane?.origin[2] ?? NaN, 26);
  } finally {
    owner.close();
  }
});

test("captured contact rejects unrepairable microscopic shelves and preserves larger rotated steps", async () => {
  const owner = new DocumentOwner();
  try {
    await owner.call({ kind: "open", document: fixture.document });
    const before = owner.view.data;
    const id = before.bodies?.[0].id;
    assert.ok(id);
    const rejected = await owner.call({
      kind: "offset-faces",
      operation: { faces: [{ body: id, face: fixture.floor }], distance: gap / 2, limit: false },
    });
    assert.match(rejected.error ?? "", /microscopic topology repair/);
    assert.equal(rejected.view.candidate, null);
    assert.equal(owner.view.data, before);
    assert.match((await owner.call({ kind: "accept" })).error ?? "", /No valid edit/);
    const smaller = await offset(owner, fixture.floor, -0.002);
    assert.equal(smaller.result.faces.length, 13, "Above-resolution shelves remain explicit");
    close(
      smaller.result.faces.find((f) => f.id === fixture.floor)?.plane?.origin[2] ?? NaN,
      24 - gap - 0.002,
    );
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const moved = await owner.call({
      kind: "transform-bodies",
      transform: {
        ids: [id],
        axis: [1, 2, 3],
        angle: 37,
        pivot: [0, 0, 0],
        translation: [12, -8, 3],
        duplicate: false,
      },
    });
    assert.equal(moved.error, undefined);
    const merged = await offset(owner, fixture.floor, gap + 0.002);
    assert.equal(merged.result.faces.length, 7);
    close(merged.result.volume, area * 24);
    for (const format of ["stl", "3mf"] as const)
      assert.ok(exportBodies([merged.result], format).length);
  } finally {
    owner.close();
  }
});

test("the original deep cavity can cross contact in one large offset", async () => {
  const owner = new DocumentOwner();
  try {
    await owner.call({ kind: "open", document: fixture.document });
    await offset(owner, fixture.floor, -(22 - gap));
    await owner.call({ kind: "accept" });
    close(
      owner.view.data.bodies?.[0].faces.find((f) => f.id === fixture.floor)?.plane?.origin[2] ??
        NaN,
      2,
    );
    for (const distance of [22, 34, 42]) {
      const merged = await offset(owner, fixture.floor, distance);
      assert.equal(merged.result.faces.length, 7);
      close(top(merged.result).plane?.origin[2] ?? NaN, 2 + distance);
      close(merged.result.volume, area * (2 + distance));
      await owner.call({ kind: "discard" });
    }
  } finally {
    owner.close();
  }
});
