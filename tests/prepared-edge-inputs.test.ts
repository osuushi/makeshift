import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { SolidCalculator } from "../src/backend/solid-calculator.js";
import { prism, square, vertical } from "./body-edge-fixtures.js";

for (const mode of ["fillet", "chamfer"] as const)
  test(`${mode}: prepared source stays isolated across previews, failures and eviction`, async () => {
    const owner = new DocumentOwner();
    const kernel = new SolidCalculator();
    try {
      const body = await prism(owner, square);
      const input = {
        kind: "edge-finish" as const,
        mode,
        size: 2,
        bodies: [body],
        edges: [{ body: body.id, edge: vertical(body, 0, 0).id }],
      };
      const first = await kernel.calculate(input);
      for (const size of [1, 3, 1.5]) await kernel.calculate({ ...input, size });
      await assert.rejects(kernel.calculate({ ...input, size: 100 }), /not feasible/);
      assert.deepEqual(await kernel.calculate(input), first);
      const invalid = {
        ...body,
        faces: body.faces.map((face, i) =>
          i
            ? face
            : {
                ...face,
                signature: face.signature.map((value, index) => (index ? value : value + 100)),
              },
        ),
      };
      await assert.rejects(
        kernel.calculate({ ...input, bodies: [invalid] }),
        /identity does not match/,
      );
      assert.deepEqual(
        await kernel.calculate(input),
        first,
        "Rejected signatures cannot poison a warm source",
      );
      // More sources than the bounded cache retains; each mapping is independent.
      for (let i = 0; i < 10; i++) {
        const renamed = { ...body, id: `other-${i}` };
        const result = await kernel.calculate({
          kind: "edge-finish-selection",
          mode,
          bodies: [renamed],
          edges: [{ body: renamed.id, edge: input.edges[0].edge }],
        });
        assert.equal(result.edgeSelection[0].body, renamed.id);
      }
      assert.deepEqual(await kernel.calculate(input), first);
      const source = await kernel.calculate({ kind: "inspect", bodies: [body] });
      assert.ok(Math.abs(source.results[0].volume - body.volume) < 1e-7);
    } finally {
      owner.close();
      kernel.close();
    }
  });

test("prepared edge inputs distinguish changed exact geometry and topology under reused body IDs", async () => {
  const owner = new DocumentOwner(),
    kernel = new SolidCalculator(),
    fresh = new SolidCalculator();
  try {
    const body = await prism(owner, square);
    const bigger = await prism(owner, [
      [0, 0],
      [30, 0],
      [30, 20],
      [0, 20],
    ]);
    const changed = {
      ...bigger,
      id: body.id,
      faces: bigger.faces.map((face, i) => ({ ...face, id: body.faces[i].id })),
      edges: bigger.edges.map((edge, i) => ({ ...edge, id: body.edges[i].id })),
    };
    const input = {
      kind: "edge-finish" as const,
      mode: "fillet" as const,
      size: 2,
      bodies: [body],
      edges: [{ body: body.id, edge: vertical(body, 0, 0).id }],
    };
    const original = await kernel.calculate(input);
    const request = {
      ...input,
      bodies: [changed],
      edges: [{ body: changed.id, edge: vertical(changed, 0, 0).id }],
    };
    const result = await kernel.calculate(request);
    assert.deepEqual(result, await fresh.calculate(request));
    assert.ok(result.results[0].volume > original.results[0].volume + 1000);
    const renamed = {
      ...body,
      faces: body.faces.map((face) => ({ ...face, id: `new-${face.id}` })),
      edges: body.edges.map((edge) => ({ ...edge, id: `new-${edge.id}` })),
    };
    const renamedRequest = {
      ...input,
      bodies: [renamed],
      edges: [{ body: body.id, edge: `new-${input.edges[0].edge}` }],
    };
    assert.deepEqual(await kernel.calculate(renamedRequest), await fresh.calculate(renamedRequest));
    assert.deepEqual(await kernel.calculate(input), original);
  } finally {
    owner.close();
    kernel.close();
    fresh.close();
  }
});
