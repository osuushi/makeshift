import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { EdgeFinishQueries } from "../src/backend/edge-finish-queries.js";
import type { KernelRequest } from "../src/backend/kernel-request.js";
import type { SolidCalculator } from "../src/backend/solid-calculator.js";
import type { ModelRequest } from "../src/sketch/model-api.js";
import type { Vector } from "../src/sketch/planes.js";
import { prism, square, vertical } from "./body-edge-fixtures.js";

test("guide fitting reuses completed solutions only for matching geometry, identities, mode, edges and points", async (context) => {
  const owner = new DocumentOwner(),
    queries = new EdgeFinishQueries();
  try {
    const body = await prism(owner, square),
      document = owner.view.data;
    const request: Extract<ModelRequest, { kind: "edge-finish-targets" }> = {
      kind: "edge-finish-targets",
      operation: {
        mode: "fillet",
        edges: [{ body: body.id, edge: vertical(body, 0, 0).id }],
      },
      points: [
        [1, 1, 5],
        [-2, -2, 5],
      ],
    };
    const kernel = Reflect.get(queries, "kernel") as SolidCalculator;
    const calculate = kernel.calculate.bind(kernel);
    let calls = 0;
    context.mock.method(kernel, "calculate", (input: KernelRequest) => {
      calls++;
      return calculate(input);
    });
    const first = await queries.calculate(document, request);
    const expected = [...first];
    first[0] = -999;
    assert.deepEqual(
      await queries.calculate(structuredClone(document), structuredClone(request)),
      expected,
    );
    assert.equal(calls, 1);
    assert.equal(expected[1], null, "Unreachable targets are reusable results");
    const invalid = {
      ...document,
      bodies: [
        {
          ...body,
          faces: body.faces.map((face, i) =>
            i
              ? face
              : {
                  ...face,
                  signature: face.signature.map((value, i) => (i ? value : value + 100)),
                },
          ),
        },
      ],
    };
    for (let i = 0; i < 2; i++)
      await assert.rejects(queries.calculate(invalid, request), /identity does not match/);
    assert.equal(calls, 3, "Invalid input is neither a hit nor a cached failure");
    assert.deepEqual(await queries.calculate(document, request), expected);
    const chamfer = await queries.calculate(document, {
      ...request,
      operation: { ...request.operation, mode: "chamfer" },
    });
    assert.ok(Math.abs((chamfer[0] ?? 0) - 2) < 1e-5);
    assert.equal(calls, 5);
    await queries.calculate(document, {
      ...request,
      operation: {
        ...request.operation,
        edges: [{ body: body.id, edge: vertical(body, 20, 20).id }],
      },
    });
    assert.equal(calls, 6);
    await queries.calculate(document, request);
    for (let i = 0; i < 9; i++)
      await queries.calculate(document, { ...request, points: [[1 + i / 100, 1, 5]] });
    assert.equal(calls, 16);
    assert.deepEqual(await queries.calculate(document, request), expected);
    assert.equal(calls, 17, "Old point sets are evicted from the bounded cache");
    const renamed = {
      ...document,
      bodies: [{ ...body, edges: body.edges.map((edge) => ({ ...edge, id: `new-${edge.id}` })) }],
    };
    await assert.rejects(queries.calculate(renamed, request), /Unknown snap source edge/);
    assert.equal(calls, 18);
  } finally {
    queries.close();
    owner.close();
  }
});

test("cancelling real guide fitting preserves concurrent preview/readouts and allows a fresh query", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const before = owner.view.data;
    const operation = {
      mode: "fillet" as const,
      edges: [{ body: body.id, edge: vertical(body, 0, 0).id }],
    };
    const small = {
      kind: "edge-finish-targets" as const,
      operation,
      points: [[1, 1, 5] as Vector],
    };
    assert.equal((await owner.call(small)).error, undefined);
    const expensive = owner.call({
      ...small,
      points: Array.from({ length: 300 }, (_, i): Vector => [0.1 + i / 100, 1, 5]),
    });
    await delay(30);
    const preview = owner.call({ kind: "finish-edges", operation: { ...operation, size: 2 } });
    const measurement = owner.call({ kind: "center-of-mass", body: body.id });
    const start = performance.now();
    assert.equal((await owner.call({ kind: "cancel-edge-finish-targets" })).error, undefined);
    console.log(`Guide cancellation: ${(performance.now() - start).toFixed(1)} ms`);
    assert.match((await expensive).error ?? "", /cancelled/i);
    assert.equal((await preview).error, undefined);
    assert.equal((await measurement).error, undefined);
    assert.equal(owner.view.data, before);
    assert.ok(owner.view.candidate);
    assert.deepEqual((await owner.call(small)).edgeFinishTargets, [3.414213562373095]);
    const next = await owner.call({ ...small, points: [[2, 2, 5]] });
    assert.equal(next.error, undefined);
    assert.ok(Math.abs((next.edgeFinishTargets?.[0] ?? 0) - 6.82842712474619) < 1e-6);
  } finally {
    owner.close();
  }
});

test("replacement guide requests discard cancelled results and restart the calculation slot", async () => {
  const owner = new DocumentOwner(),
    queries = new EdgeFinishQueries();
  try {
    const body = await prism(owner, square);
    const request = {
      kind: "edge-finish-targets" as const,
      operation: {
        mode: "fillet" as const,
        edges: [{ body: body.id, edge: vertical(body, 0, 0).id }],
      },
      points: [[1, 1, 5] as Vector],
    };
    const abandoned = queries.calculate(owner.view.data, {
      ...request,
      points: Array.from({ length: 300 }, (_, i): Vector => [0.1 + i / 100, 1, 5]),
    });
    const rejected = assert.rejects(abandoned, /cancelled/i);
    const replaced = queries.calculate(owner.view.data, request);
    await rejected;
    assert.ok(Math.abs(((await replaced)[0] ?? 0) - 3.414213562373095) < 1e-6);
    const result = await queries.calculate(owner.view.data, request);
    assert.deepEqual(result, await replaced);
  } finally {
    queries.close();
    owner.close();
  }
});
