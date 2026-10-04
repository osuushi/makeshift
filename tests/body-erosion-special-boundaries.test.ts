import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { erosionSpecialCases } from "./erosion-special-fixtures.js";

function fixture(name: string) {
  const entry = erosionSpecialCases.find((entry) => entry.name === name);
  assert.ok(entry);
  return entry;
}
test("thin branch removal must preserve its root within the requested allowance", async () => {
  const owner = new DocumentOwner();
  try {
    const source = await fixture("thin-round-branch").build(owner);
    const before = owner.view.data;
    assert.equal(
      (
        await owner.call({
          kind: "erode",
          operation: { method: "accurate", ids: [source.id], thickness: 1, allowance: 0.25 },
        })
      ).error,
      undefined,
    );
    await owner.call({ kind: "accept" });
    const accepted = owner.view.data;
    await owner.call({ kind: "undo" });
    const reply = await owner.call({
      kind: "erode",
      operation: { method: "accurate", ids: [source.id], thickness: 1, allowance: 0 },
    });
    assert.ok(reply.error, "A branch's disappearance does not justify discarding its thicker root");
    assert.equal(reply.view.candidate, null);
    assert.equal(reply.view.data, before);
    assert.ok((await owner.call({ kind: "accept" })).error);
    await owner.call({ kind: "redo" });
    assert.equal(owner.view.data, accepted);
  } finally {
    owner.close();
  }
});
for (const [name, thickness] of [
  ["hollow-sphere", 1],
  ["torus", 3],
] as const) {
  test(`exact zero-volume collapse: ${name}`, async () => {
    const owner = new DocumentOwner();
    try {
      const source = await fixture(name).build(owner);
      const before = owner.view.data;
      const reply = await owner.call({
        kind: "erode",
        operation: {
          method: "accurate",
          ids: [source.id],
          thickness,
          allowance: 0,
          keepOriginals: false,
        },
      });
      assert.equal(reply.error, undefined);
      assert.equal(reply.view.candidate?.bodies?.length, 0);
      await owner.call({ kind: "accept" });
      assert.equal(owner.view.data.bodies?.length, 0);
      await owner.call({ kind: "undo" });
      assert.equal(owner.view.data, before);
    } finally {
      owner.close();
    }
  });
}
for (const name of ["double-torus", "sphere-plane-fillet", "merging-cavities"]) {
  test(`complex erosion preserves rigid placement: ${name}`, async () => {
    const owner = new DocumentOwner();
    try {
      const entry = fixture(name),
        source = await entry.build(owner);
      const operation = {
        ids: [source.id],
        thickness: entry.thickness,
        allowance: entry.allowance,
      };
      const first = await owner.call({
        kind: "erode",
        operation: { ...operation, method: "accurate" },
      });
      assert.equal(first.error, undefined);
      const original = first.view.candidate?.bodies?.filter((body) => body.id !== source.id) ?? [];
      await owner.call({ kind: "discard" });
      assert.equal(
        (
          await owner.call({
            kind: "transform-bodies",
            transform: {
              ids: [source.id],
              pivot: [0, 0, 0],
              axis: [1, 2, 3],
              angle: 37,
              translation: [41, -17, 9],
              duplicate: false,
            },
          })
        ).error,
        undefined,
      );
      const moved = await owner.call({
        kind: "erode",
        operation: { ...operation, method: "accurate" },
      });
      assert.equal(moved.error, undefined);
      const results = moved.view.candidate?.bodies?.filter((body) => body.id !== source.id) ?? [];
      assert.equal(results.length, original.length);
      assert.ok(
        Math.abs(
          results.reduce((sum, body) => sum + body.volume, 0) -
            original.reduce((sum, body) => sum + body.volume, 0),
        ) < 5e-5,
      );
    } finally {
      owner.close();
    }
  });
}
