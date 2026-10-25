import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate as tick } from "node:timers/promises";
import { EdgeFinishTargetClient } from "../src/sketch/edge-finish-target-client.js";
import type { ModelReply, ModelRequest } from "../src/sketch/model-api.js";

const operation = { mode: "fillet" as const, edges: [{ body: "b", edge: "e" }] };
const reply: ModelReply = {
  view: {
    data: { units: "mm", sketches: [] },
    candidate: null,
    canUndo: false,
    canRedo: false,
    solveCount: 0,
    solveMs: 0,
  },
  edgeFinishTargets: [2],
};

test("new guide gestures wait for cancellation acknowledgement and ignore the old result", async () => {
  const requests: { input: ModelRequest; resolve(value: ModelReply): void }[] = [];
  const client = new EdgeFinishTargetClient(
    (input) => new Promise((resolve) => requests.push({ input, resolve })),
  );
  const controller = new AbortController();
  const first = client.query(operation, [[1, 1, 5]], controller.signal);
  const rejected = assert.rejects(first, /cancelled/);
  await tick();
  controller.abort();
  const second = client.query(operation, [[2, 2, 5]]);
  assert.deepEqual(
    requests.map((r) => r.input.kind),
    ["edge-finish-targets", "cancel-edge-finish-targets"],
  );
  requests[0].resolve(reply);
  await tick();
  assert.equal(requests.length, 2, "A late cancellation must not hit the replacement query");
  requests[1].resolve(reply);
  await rejected;
  await tick();
  assert.equal(requests.length, 3);
  requests[2].resolve(reply);
  assert.deepEqual(await second, [2]);
  controller.abort();
  assert.equal(requests.length, 3);
});

test("aborted queued queries never start and completed queries do not cancel later work", async () => {
  let calls = 0;
  const client = new EdgeFinishTargetClient(async () => {
    calls++;
    return reply;
  });
  const queued = new AbortController();
  const request = client.query(operation, [], queued.signal);
  queued.abort();
  await assert.rejects(request, /cancelled/);
  assert.equal(calls, 0);
  const completed = new AbortController();
  assert.deepEqual(await client.query(operation, [[1, 1, 5]], completed.signal), [2]);
  completed.abort();
  assert.deepEqual(await client.query(operation, [[2, 2, 5]]), [2]);
  assert.equal(calls, 2);
});
