import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body, Face } from "../src/model/body.js";
import { exportBodies } from "../src/model/mesh-export.js";
import type { SketchDocument } from "../src/sketch/document.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/offset-decimal-contact.json", "utf8")) as {
  document: SketchDocument;
  floor: string;
  rim: string;
};
const gap = 9.78;
const area = 1215.503931867781; // Captured bottom footprint; prism volume = area × height.
const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);
function top(body: Body): Face {
  const face = body.faces.find((f) => f.plane && f.plane.origin[1] < -1);
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

test("decimal-height cavity merges and continues across reversed cylinder axes", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const before = owner.view.data;
    for (const distance of [gap, gap + 0.0001, 12, 38]) {
      const { result, selection } = await offset(owner, fixture.floor, distance);
      const height = 2 + distance;
      assert.equal(result.faces.length, 6, "Four outer walls and two caps; no residual inner wall");
      assert.equal(result.faces.filter((f) => f.plane).length, 2);
      close(-(top(result).plane?.origin[1] ?? NaN), height);
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
    close(further.result.volume, area * 13.78);
    close(-(top(further.result).plane?.origin[1] ?? NaN), 13.78);
  } finally {
    owner.close();
  }
});

test("decimal contact rejects unrepairable microscopic shelves and preserves larger shelves and placement", async () => {
  const owner = new DocumentOwner();
  try {
    await owner.call({ kind: "open", document: fixture.document });
    const before = owner.view.data;
    const bodyId = before.bodies?.[0].id;
    assert.ok(bodyId);
    const rejected = await owner.call({
      kind: "offset-faces",
      operation: {
        faces: [{ body: bodyId, face: fixture.floor }],
        distance: gap - 0.0005,
        limit: false,
      },
    });
    assert.match(rejected.error ?? "", /microscopic topology repair/);
    assert.equal(rejected.view.candidate, null);
    assert.equal(owner.view.data, before);
    assert.match((await owner.call({ kind: "accept" })).error ?? "", /No valid edit/);
    const smaller = await offset(owner, fixture.floor, gap - 0.002);
    assert.equal(smaller.result.faces.length, 11, "An above-resolution shelf must remain explicit");
    close(
      -(smaller.result.faces.find((f) => f.id === fixture.floor)?.plane?.origin[1] ?? NaN),
      11.778,
    );
    await owner.call({ kind: "discard" });
    const id = owner.view.data.bodies?.[0].id;
    assert.ok(id);
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
    const merged = await offset(owner, fixture.floor, 38);
    assert.equal(merged.result.faces.length, 6);
    close(merged.result.volume, area * 40);
    for (const format of ["stl", "3mf"] as const)
      assert.ok(exportBodies([merged.result], format).length);
  } finally {
    owner.close();
  }
});
