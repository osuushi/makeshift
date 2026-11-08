import assert from "node:assert/strict";
import test from "node:test";
import type { ScriptOperation, SolidResult } from "../src/agent-script/api.js";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { hasFailureCode } from "../src/model/calculation-failure.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";
import { prism, square, vertical } from "./body-edge-fixtures.js";
import { cap } from "./shell-fixtures.js";

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
test("agent Booleans preserve ordered operands, keep-original semantics and manual volumes", async () => {
  const owner = new DocumentOwner();
  try {
    const a = await prism(owner, square),
      b = await prism(
        owner,
        square.map(([x, y]) => [x + 10, y]),
      );
    const original = owner.view.data;
    for (const mode of ["union", "subtract", "intersect"] as const)
      for (const keepOriginals of [false, true]) {
        const input = { ids: [a.id, b.id], mode, keepOriginals };
        const manual = await owner.call({ kind: "boolean-bodies", operation: input });
        assert.equal(manual.error, undefined);
        const expected = manual.view.candidate?.bodies;
        assert(expected);
        await owner.call({ kind: "discard" });
        owner.beginScript("boolean.ts");
        const result = (await owner.scripts.step({ kind: "booleanBodies", input })) as SolidResult;
        assert.equal(result.bodies.length, expected.length);
        near(
          result.bodies.reduce((sum, b) => sum + b.volume, 0),
          expected.reduce((sum, b) => sum + b.volume, 0),
        );
        assert.equal(owner.view.data, original);
        owner.scripts.finish();
        const accepted = owner.view.data;
        const ids =
          accepted.bodies?.flatMap((b) => [
            b.id,
            ...b.faces.map((f) => f.id),
            ...b.edges.map((e) => e.id),
          ]) ?? [];
        assert.equal(new Set(ids).size, ids.length);
        await owner.call({ kind: "undo" });
        assert.equal(owner.view.data, original);
        await owner.call({ kind: "redo" });
        assert.equal(owner.view.data, accepted);
        await owner.call({ kind: "undo" });
      }
    owner.beginScript("reverse.ts");
    await owner.scripts.step({
      kind: "booleanBodies",
      input: { ids: [b.id, a.id], mode: "subtract", keepOriginals: false },
    });
    owner.scripts.finish();
    near(owner.view.data.bodies?.[0].bounds[0] ?? NaN, 20);
  } finally {
    owner.close();
  }
});
test("agent fillet/chamfer match manual geometry, reject clamping and zero is a no-op", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square),
      original = owner.view.data;
    const edges = [{ body: body.id, edge: vertical(body, 0, 0).id }];
    for (const mode of ["fillet", "chamfer"] as const) {
      const input = { edges, mode, size: 2 };
      const manual = await owner.call({ kind: "finish-edges", operation: input });
      assert.equal(manual.error, undefined);
      const expected = manual.view.candidate?.bodies?.[0];
      assert(expected);
      await owner.call({ kind: "discard" });
      owner.beginScript("finish.ts");
      const result = (await owner.scripts.step({ kind: "finishEdges", input })) as SolidResult;
      near(result.bodies[0].volume, expected.volume);
      assert.equal(result.bodies[0].id, body.id);
      assert(!result.bodies[0].edges.includes(edges[0].edge));
      owner.scripts.finish();
      const accepted = owner.view.data;
      await owner.call({ kind: "undo" });
      assert.equal(owner.view.data, original);
      await owner.call({ kind: "redo" });
      assert.equal(owner.view.data, accepted);
      await owner.call({ kind: "undo" });
    }
    const tooLarge = { edges, mode: "fillet" as const, size: 100 };
    const manual = await owner.call({ kind: "finish-edges", operation: tooLarge });
    assert.equal(manual.error, undefined);
    assert((manual.view.edgeSize ?? 100) < 100);
    await owner.call({ kind: "discard" });
    owner.beginScript("oversize.ts");
    await assert.rejects(
      () => owner.scripts.step({ kind: "finishEdges", input: tooLarge }),
      (error) => hasFailureCode(error, "geometric-infeasibility"),
    );
    await owner.scripts.cancel("oversize");
    assert.equal(owner.view.data, original);
    assert(owner.view.canRedo);
    owner.beginScript("zero.ts");
    await owner.scripts.step({ kind: "finishEdges", input: { ...tooLarge, size: 0 } });
    assert.equal(owner.scripts.finish(), false);
    assert(owner.view.canRedo);
  } finally {
    owner.close();
  }
});
test("agent Shell matches inward/outward open/closed manual results and archive", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square),
      original = owner.view.data;
    for (const thickness of [-1, 1])
      for (const open of [false, true]) {
        const before = owner.view.data;
        const input = {
          selection: [{ body: body.id, faces: open ? [cap(body, 10)] : [] }],
          thickness,
        };
        const manual = await owner.call({ kind: "shell", operation: input });
        assert.equal(manual.error, undefined);
        const expected = manual.view.candidate?.bodies?.[0];
        assert(expected);
        await owner.call({ kind: "discard" });
        owner.beginScript("shell.ts");
        const result = (await owner.scripts.step({ kind: "shell", input })) as SolidResult;
        near(result.bodies[0].volume, expected.volume);
        owner.scripts.finish();
        const accepted = owner.view.data;
        await owner.call({ kind: "undo" });
        assert.equal(owner.view.data, before);
        await owner.call({ kind: "redo" });
        assert.equal(owner.view.data, accepted);
        await owner.call({ kind: "undo" });
        assert.equal(
          (await owner.call({ kind: "open", document: readArchive(documentArchive(accepted)) }))
            .error,
          undefined,
        );
        near(owner.view.data.bodies?.[0].volume ?? NaN, expected.volume);
        await owner.call({ kind: "open", document: original });
      }
  } finally {
    owner.close();
  }
});
test("invalid solid targets fail atomically, preserving Redo", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square),
      edge = { body: body.id, edge: vertical(body, 0, 0).id };
    owner.beginScript("seed.ts");
    await owner.scripts.step({
      kind: "finishEdges",
      input: { edges: [edge], mode: "fillet", size: 1 },
    });
    owner.scripts.finish();
    await owner.call({ kind: "undo" });
    const original = owner.view.data;
    const operations: ScriptOperation[] = [
      {
        kind: "booleanBodies",
        input: { ids: [body.id, body.id], mode: "union", keepOriginals: false },
      },
      {
        kind: "booleanBodies",
        input: { ids: [body.id, "missing"], mode: "subtract", keepOriginals: false },
      },
      { kind: "finishEdges", input: { edges: [edge, edge], mode: "fillet", size: 1 } },
      {
        kind: "finishEdges",
        input: { edges: [{ ...edge, edge: "missing" }], mode: "chamfer", size: 1 },
      },
      { kind: "finishEdges", input: { edges: [edge], mode: "fillet", size: NaN } },
      {
        kind: "shell",
        input: { selection: [{ body: body.id, faces: ["missing"] }], thickness: -1 },
      },
      { kind: "shell", input: { selection: [{ body: body.id, faces: [] }], thickness: -100 } },
    ];
    for (const operation of operations) {
      owner.beginScript("bad.ts");
      await owner.scripts.step({
        kind: "constructionPlane",
        input: { frame: { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0] } },
      });
      await assert.rejects(() => owner.scripts.step(operation));
      await owner.scripts.cancel("invalid");
      assert.equal(owner.view.data, original);
      assert(owner.view.canRedo);
    }
  } finally {
    owner.close();
  }
});
