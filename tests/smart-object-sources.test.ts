import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { ModelRequest } from "../src/sketch/model-api.js";

test("placement sources check incoming links against the bench being edited", async () => {
  const owner = new DocumentOwner();
  const apply = async (request: ModelRequest) => {
    const reply = await owner.call(request);
    assert.equal(reply.error, undefined);
    return reply;
  };
  const add = async () => {
    await apply({ kind: "bench", edit: { action: "create" } });
    return owner.drawing.activeBench;
  };
  const open = (id: string) => apply({ kind: "bench", edit: { action: "switch", id } });
  const link = async (source: string) => {
    const { view } = await apply({ kind: "smart-object", edit: { action: "insert", source } });
    const placement = view.data.smartObjects?.at(-1);
    assert.ok(placement);
    return placement.id;
  };
  const enter = (id: string) => apply({ kind: "smart-object", edit: { action: "enter", id } });
  const sources = async () =>
    (await apply({ kind: "smart-object-sources" })).smartObjectSources?.map(
      ({ id, wouldCycle }) => [id, wouldCycle],
    );
  try {
    const inner = owner.drawing.activeBench;
    const middle = await add();
    const innerLink = await link(inner);
    const outer = await add();
    const middleLink = await link(middle);
    const independent = await add();
    await open(inner);
    assert.equal(owner.view.linkedBenches, undefined);
    const blocked = [
      [middle, true],
      [outer, true],
      [independent, false],
    ];
    assert.deepEqual(await sources(), blocked);
    const cycle = await owner.call({
      kind: "smart-object",
      edit: { action: "insert", source: outer },
    });
    assert.match(cycle.error ?? "", /own bench/);
    assert.equal(owner.view.data.smartObjects, undefined);

    await open(outer);
    await enter(middleLink);
    await enter(innerLink);
    assert.equal(owner.view.activeBench, outer);
    assert.equal(owner.view.editingBench, inner);
    assert.deepEqual(await sources(), blocked);

    await open(middle);
    await apply({ kind: "undo" });
    await open(inner);
    assert.deepEqual(await sources(), [
      [middle, false],
      [outer, false],
      [independent, false],
    ]);
    await open(middle);
    await apply({ kind: "redo" });
    await open(inner);
    assert.deepEqual(await sources(), blocked);
  } finally {
    owner.close();
  }
});
