import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { KernelRequest } from "../src/backend/kernel-request.js";
import type { SolidCalculator } from "../src/backend/solid-calculator.js";
import { surfaceFixture, withValue } from "./surface-preview-fixtures.js";

for (const kind of ["offset", "fillet", "chamfer"] as const)
  test(`${kind}: exact input rejects once, explicit search limits, cached limits cannot replace exact input`, async (context) => {
    const owner = new DocumentOwner();
    try {
      const { request } = await surfaceFixture(owner, kind);
      const before = owner.view.data;
      const kernel = Reflect.get(owner, "kernel") as SolidCalculator;
      const calculate = kernel.calculate.bind(kernel);
      const calls: KernelRequest[] = [];
      context.mock.method(kernel, "calculate", (input: KernelRequest) => {
        calls.push(input);
        return calculate(input);
      });
      const overshoot = withValue(request, kind === "offset" ? -100 : 100);
      const exact = structuredClone(overshoot);
      exact.operation.limit = false;
      const rejected = await owner.call(exact);
      assert.ok(rejected.error);
      assert.equal(calls.length, 1, "Only the requested geometry is calculated");
      assert.equal(rejected.view.candidate, null);
      assert.equal(rejected.view.data, before);
      overshoot.operation.limit = true;
      const nearest = await owner.call(overshoot);
      assert.equal(nearest.error, undefined);
      assert.ok(nearest.view.candidate);
      const value = kind === "offset" ? nearest.view.offsetDistance : nearest.view.edgeSize;
      assert.ok(value !== undefined && Math.abs(value) < 100 && Math.abs(value) > 0);
      calls.length = 0;
      assert.ok(
        (await owner.call(exact)).error,
        "A prior verified limit cannot satisfy typed input",
      );
      assert.equal(calls.length, 1);
      assert.equal(owner.view.candidate, null);
      assert.match((await owner.call({ kind: "accept" })).error ?? "", /No valid edit/);
      const corrected = withValue(request, 1);
      corrected.operation.limit = false;
      assert.equal((await owner.call(corrected)).error, undefined);
      assert.equal(kind === "offset" ? owner.view.offsetDistance : owner.view.edgeSize, 1);
      await owner.call({ kind: "accept" });
      const accepted = owner.view.data;
      await owner.call({ kind: "undo" });
      assert.equal(owner.view.data, before);
      await owner.call({ kind: "redo" });
      assert.equal(owner.view.data, accepted);
      if (kind !== "offset") {
        await owner.call({ kind: "undo" });
        const microscopic = withValue(request, 0.0005);
        microscopic.operation.limit = false;
        assert.match((await owner.call(microscopic)).error ?? "", /zero or at least 0.001 mm/);
        assert.equal(owner.view.candidate, null, "Exact small sizes must not silently become zero");
      }
    } finally {
      owner.close();
    }
  });

test("captured outer diameter: 4 rejects without substituting 22, then 40 previews exactly", async () => {
  const owner = new DocumentOwner();
  try {
    const fixture = JSON.parse(readFileSync("tests/fixtures/offset-typed-diameter.json", "utf8"));
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const before = owner.view.data;
    const body = before.bodies?.[0];
    const face = body?.faces.find((face) => face.cylinder?.outward === 1);
    assert.ok(body && face?.cylinder);
    const operation = {
      faces: [{ body: body.id, face: face.id }],
      distance: 2 - face.cylinder.radius,
      limit: false,
    };
    assert.ok((await owner.call({ kind: "offset-faces", operation })).error);
    assert.equal(owner.view.candidate, null);
    assert.equal(owner.view.data, before);
    const nearest = await owner.call({
      kind: "offset-faces",
      operation: { ...operation, limit: true },
    });
    assert.equal(nearest.error, undefined);
    const limited = nearest.view.candidate?.bodies?.[0].faces.find((f) => f.id === face.id);
    assert.ok(limited?.cylinder);
    assert.ok(limited.cylinder.radius > 11 && limited.cylinder.radius < 11.01);
    const corrected = await owner.call({
      kind: "offset-faces",
      operation: { ...operation, distance: 20 - face.cylinder.radius },
    });
    assert.equal(corrected.error, undefined);
    const result = corrected.view.candidate?.bodies?.[0];
    assert.ok(result);
    assert.equal(result.faces.find((f) => f.id === face.id)?.cylinder?.radius, 20);
    assert.ok(Math.abs(result.volume - Math.PI * (20 ** 2 - 10.5 ** 2) * 29) < 1e-6);
    assert.equal(owner.view.data, before);
  } finally {
    owner.close();
  }
});
