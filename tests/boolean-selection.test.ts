import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { BodyBoolean } from "../src/model/body.js";
import {
  booleanConsumes,
  booleanRequirement,
  booleanRole,
  cycleBooleanBody,
  flipBooleanRole,
} from "../src/model/boolean-selection.js";
import { box } from "./body-boolean-helpers.js";

test("Subtract fills missing roles without changing any other body's role", () => {
  let operation: BodyBoolean = { ids: [], targetIds: [], mode: "subtract", keepOriginals: true };
  assert.match(booleanRequirement(operation) ?? "", /target body/);
  operation = cycleBooleanBody(operation, "a");
  assert.equal(booleanRole(operation, "a"), "target");
  assert.match(booleanRequirement(operation) ?? "", /cutting tool/);
  operation = cycleBooleanBody(operation, "b");
  assert.equal(booleanRole(operation, "a"), "target");
  assert.equal(booleanRole(operation, "b"), "tool");
  assert.equal(booleanRequirement(operation), null);
  operation = flipBooleanRole(operation, "b");
  assert.deepEqual(operation.ids, ["a", "b"]);
  assert.equal(booleanRole(operation, "a"), "target");
  assert.equal(booleanRole(operation, "b"), "target");
  assert.match(booleanRequirement(operation) ?? "", /cutting tool/);
  operation = cycleBooleanBody(operation, "c");
  assert.equal(booleanRole(operation, "c"), "tool");
  assert.equal(booleanRequirement(operation), null);
  assert.deepEqual(
    operation.ids.filter((id) => booleanConsumes(operation, id)),
    ["a", "b"],
  );
  operation = cycleBooleanBody(operation, "a");
  operation = cycleBooleanBody(operation, "b");
  assert.match(booleanRequirement(operation) ?? "", /target body/);
  operation = cycleBooleanBody(operation, "a");
  assert.equal(booleanRole(operation, "a"), undefined);
  operation = cycleBooleanBody(operation, "a");
  assert.equal(booleanRole(operation, "a"), "target");
  assert.equal(booleanRole(operation, "b"), "tool");
});

test("legacy ordered inputs preserve first target and union toggles membership", () => {
  const operation: BodyBoolean = { ids: ["b", "a"], mode: "subtract", keepOriginals: false };
  assert.equal(booleanRole(operation, "b"), "target");
  assert.equal(booleanRole(operation, "a"), "tool");
  assert.deepEqual(cycleBooleanBody({ ...operation, mode: "union" }, "b").ids, ["a"]);
});

test("explicit subtraction roles cut multiple targets atomically and preserve optional tools", async () => {
  const owner = new DocumentOwner();
  try {
    const a = await box(owner, 0, 0, 10, 10);
    const b = await box(owner, 20, 0, 30, 10);
    const cutter = await box(owner, -1, 4, 31, 6);
    const original = owner.view.data;
    const operation: BodyBoolean = {
      ids: [cutter.id, a.id, b.id],
      targetIds: [a.id, b.id],
      mode: "subtract",
      keepOriginals: true,
    };
    let reply = await owner.call({ kind: "boolean-bodies", operation });
    assert.equal(reply.error, undefined);
    const result = reply.view.candidate?.bodies ?? [];
    assert.ok(
      Math.abs(result.reduce((sum, body) => sum + body.volume, 0) - 1600 - cutter.volume) < 1e-6,
    );
    assert.deepEqual(
      result.find((body) => body.id === cutter.id),
      cutter,
    );
    const ids = result.flatMap((body) => [
      body.id,
      ...body.faces.map((face) => face.id),
      ...body.edges.map((edge) => edge.id),
    ]);
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual(owner.view.data, original);
    await owner.call({ kind: "accept" });
    const accepted = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, original);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, accepted);
    await owner.call({ kind: "undo" });
    reply = await owner.call({
      kind: "boolean-bodies",
      operation: { ...operation, keepOriginals: false },
    });
    assert.equal(reply.error, undefined);
    assert.ok(
      Math.abs(
        (reply.view.candidate?.bodies ?? []).reduce((sum, body) => sum + body.volume, 0) - 1600,
      ) < 1e-6,
    );
    for (const targetIds of [[], operation.ids, ["missing"], [a.id, a.id]]) {
      reply = await owner.call({ kind: "boolean-bodies", operation: { ...operation, targetIds } });
      assert.ok(reply.error);
      assert.equal(reply.view.candidate, null);
      assert.deepEqual(owner.view.data, original);
    }
  } finally {
    owner.close();
  }
});
