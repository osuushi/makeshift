import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Face } from "../src/model/body.js";
import type { SketchDocument } from "../src/sketch/document.js";

function fixture(name: string): { document: SketchDocument; faces: string[] } {
  return JSON.parse(readFileSync(`tests/fixtures/delete-band-${name}.json`, "utf8"));
}
function near(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-5, `${actual} != ${expected}`);
}
const cases = [
  { name: "concave", height: 32, volume: Math.PI * (100 * 32 + 25 * 26) },
  { name: "convex", height: 32, volume: Math.PI * (100 * 32 + 25 * 26) },
  { name: "cylinder", height: 27, volume: Math.PI * (100 * 27 + 25 * 31) },
  { name: "rectangle", height: 21, volume: 400 * 21 + 121 * 20 },
  { name: "nonplanar", height: 9, volume: 400 * 9 + Math.PI * 6.5 ** 2 * 21 },
];
for (const { name, height, volume } of cases) {
  test(`captured ${name} Delete: exact shelf, surviving supports, history and later offset`, async () => {
    const owner = new DocumentOwner();
    try {
      const capture = fixture(name);
      assert.equal(
        (await owner.call({ kind: "open", document: capture.document })).error,
        undefined,
      );
      const before = owner.view.data;
      const body = before.bodies?.[0];
      assert.ok(body);
      const reply = await owner.call({
        kind: "delete-topology",
        selection: [{ body: body.id, whole: false, faces: capture.faces, edges: [] }],
      });
      assert.equal(reply.error, undefined);
      assert.equal(reply.view.candidate, null);
      const after = owner.view.data;
      const result = after.bodies?.[0];
      assert.ok(result);
      near(result.volume, volume);
      assert.equal(result.id, body.id);
      assert.ok(capture.faces.every((id) => !result.faces.some((f) => f.id === id)));
      const shelf = result.faces.find(
        (f) =>
          f.plane &&
          f.bounds &&
          Math.abs(f.bounds[2] - height) < 1e-6 &&
          Math.abs(f.bounds[5] - height) < 1e-6,
      );
      assert.ok(shelf);
      if (!["concave", "convex"].includes(name)) {
        assert.equal(result.faces.length, body.faces.length - capture.faces.length + 1);
        const survivingEdges = new Set(
          body.faces.filter((f) => !capture.faces.includes(f.id)).flatMap((f) => f.edges),
        );
        assert.deepEqual(new Set(result.edges.map((edge) => edge.id)), survivingEdges);
        for (const original of body.faces.filter((f) => !capture.faces.includes(f.id))) {
          const continued: Face | undefined = result.faces.find((f) => f.id === original.id);
          assert.ok(continued, "Unselected faces continue");
          assert.deepEqual(continued.cylinder, original.cylinder);
          assert.deepEqual(continued.plane, original.plane);
        }
      }
      assert.equal((await owner.call({ kind: "undo" })).error, undefined);
      assert.deepEqual(owner.view.data, before);
      assert.equal((await owner.call({ kind: "redo" })).error, undefined);
      assert.deepEqual(owner.view.data, after);
      assert.equal((await owner.call({ kind: "open", document: after })).error, undefined);
      const moved = await owner.call({
        kind: "offset-faces",
        operation: { faces: [{ body: body.id, face: shelf.id }], distance: 1 },
      });
      assert.equal(moved.error, undefined);
      near(moved.view.candidate?.bodies?.[0].volume ?? NaN, volume + shelf.signature[2]);
    } finally {
      owner.close();
    }
  });
}

test("rigorous repair retains precedence for partial transition selections", async () => {
  const owner = new DocumentOwner();
  try {
    const capture = fixture("rectangle");
    assert.equal((await owner.call({ kind: "open", document: capture.document })).error, undefined);
    const before = owner.view.data;
    const body = before.bodies?.[0];
    assert.ok(body);
    for (const faces of [capture.faces.slice(0, 1), capture.faces.slice(0, 3)]) {
      const reply = await owner.call({
        kind: "delete-topology",
        selection: [{ body: body.id, whole: false, faces, edges: [] }],
      });
      assert.equal(reply.error, undefined);
      const result = reply.view.data.bodies?.[0];
      assert.ok(result);
      assert.equal(result.faces.length, body.faces.length - faces.length);
      assert.ok(
        capture.faces
          .filter((id) => !faces.includes(id))
          .every((id) => result.faces.some((f) => f.id === id)),
      );
      assert.equal(reply.view.candidate, null);
      await owner.call({ kind: "undo" });
      assert.deepEqual(owner.view.data, before);
    }
  } finally {
    owner.close();
  }
});

for (const name of ["cylinder", "rectangle", "nonplanar"]) {
  test(`transition ${name} is independent of world axes and selection order`, async () => {
    const owner = new DocumentOwner();
    try {
      const capture = fixture(name);
      assert.equal(
        (await owner.call({ kind: "open", document: capture.document })).error,
        undefined,
      );
      const id = owner.view.data.bodies?.[0]?.id;
      assert.ok(id);
      assert.equal(
        (
          await owner.call({
            kind: "transform-bodies",
            transform: {
              ids: [id],
              axis: [1, 2, -3],
              angle: 123,
              pivot: [0, 0, 0],
              translation: [103, -57, 82],
              duplicate: false,
            },
          })
        ).error,
        undefined,
      );
      const reply = await owner.call({
        kind: "delete-topology",
        selection: [{ body: id, whole: false, faces: [...capture.faces].reverse(), edges: [] }],
      });
      assert.equal(reply.error, undefined);
      near(
        reply.view.data.bodies?.[0].volume ?? NaN,
        cases.find((c) => c.name === name)?.volume ?? NaN,
      );
    } finally {
      owner.close();
    }
  });
}

test("failed second body rolls back a successful transition fallback", async () => {
  const owner = new DocumentOwner();
  try {
    const capture = fixture("cylinder");
    const rectangle = fixture("rectangle");
    const document = {
      ...capture.document,
      bodies: [...(capture.document.bodies ?? []), ...(rectangle.document.bodies ?? [])],
    };
    assert.equal((await owner.call({ kind: "open", document })).error, undefined);
    const before = owner.view.data;
    const a = before.bodies?.[0],
      b = before.bodies?.[1];
    assert.ok(a && b);
    const cap = b.faces.find((f) => f.plane && Math.abs(f.plane.origin[2] - 41) < 1e-6);
    assert.ok(cap);
    const reply = await owner.call({
      kind: "delete-topology",
      selection: [
        { body: a.id, whole: false, faces: capture.faces, edges: [] },
        { body: b.id, whole: false, faces: [cap.id], edges: [] },
      ],
    });
    assert.ok(reply.error);
    assert.deepEqual(owner.view.data, before);
  } finally {
    owner.close();
  }
});
