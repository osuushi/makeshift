import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { materialize } from "../src/backend/kernel-result.js";
import { SolidCalculator } from "../src/backend/solid-calculator.js";
import { prism, square } from "./body-edge-fixtures.js";

test("a real sub-threshold fillet may draw but fails final volume validation without accepting", async () => {
  const owner = new DocumentOwner(),
    kernel = new SolidCalculator();
  try {
    const body = await prism(owner, square),
      side = 0.0001001;
    const tiny = materialize(
      [body],
      await kernel.calculate({
        kind: "scale",
        ids: [body.id],
        factor: 1,
        factors: [side / 20, side / 20, side / 10],
        pivot: [0, 0, 0],
        bodies: [body],
      }),
    )[0];
    assert.ok(tiny.volume > 1e-12);
    // Nonuniform scaling preserves the exact straight edge but can present it
    // as a spline. Select its current coordinates rather than its curve tag.
    const edge = tiny.edges.find((edge) =>
      edge.points.every((value, index) => index % 3 === 2 || Math.abs(value) < 1e-7),
    );
    assert.ok(edge);
    assert.equal(
      (await owner.call({ kind: "open", document: { units: "mm", sketches: [], bodies: [tiny] } }))
        .error,
      undefined,
    );
    const original = owner.view.data;
    const request = {
      kind: "finish-edges" as const,
      presentation: "deferred" as const,
      operation: {
        mode: "fillet" as const,
        size: 0.00002,
        edges: [{ body: tiny.id, edge: edge.id }],
      },
    };
    const preview = await owner.call(request);
    assert.equal(preview.error, undefined);
    assert.ok(preview.view.visualPreview?.bodies[0].faces.length);
    assert.equal(preview.view.candidate, null);
    assert.match(
      (await owner.call({ kind: "complete-preview" })).error ?? "",
      /no measurable solid volume/,
    );
    assert.equal(owner.view.data, original);
    assert.equal(owner.view.candidate, null);
    assert.equal(owner.view.visualPreview, undefined);
    assert.match((await owner.call({ kind: "accept" })).error ?? "", /No valid edit/);
    const smaller = { ...request, operation: { ...request.operation, size: 0.000002 } };
    assert.equal((await owner.call(smaller)).error, undefined);
    assert.equal((await owner.call({ kind: "complete-preview" })).error, undefined);
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    assert.ok((owner.view.data.bodies?.[0].volume ?? 0) > 1e-12);
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, original);
  } finally {
    owner.close();
    kernel.close();
  }
});
