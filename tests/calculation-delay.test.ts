import assert from "node:assert/strict";
import { test } from "node:test";
import type { ModelReply } from "../src/sketch/model-api.js";
import { ModelClient } from "../src/sketch/model-client.js";

// Presentation timing only; native geometry and pending pointer updates have UI coverage.
test("calculation feedback waits 500 ms and cancels/resets its timer between requests", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let reply = heldReply();
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { makeshiftModel: () => reply.promise },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  });
  const states: boolean[] = [];
  const client = new ModelClient(
    () => states.push(client.slow),
    (message) => {
      if (message) assert.fail(message);
    },
  );
  const response: ModelReply = {
    view: {
      data: { units: "mm", sketches: [] },
      candidate: null,
      canUndo: false,
      canRedo: false,
      solveCount: 0,
      solveMs: 0,
    },
  };
  const slow = client.request({ kind: "discard" });
  t.mock.timers.tick(499);
  assert.equal(client.slow, false);
  t.mock.timers.tick(1);
  assert.equal(client.slow, true);
  reply.resolve(response);
  assert.equal(await slow, true);
  assert.equal(client.slow, false);
  states.length = 0;
  reply = heldReply();
  const fast = client.request({ kind: "discard" });
  t.mock.timers.tick(200);
  reply.resolve(response);
  assert.equal(await fast, true);
  t.mock.timers.tick(1000);
  assert.ok(
    states.every((slow) => !slow),
    "Completed short calculations cannot flash later",
  );
  reply = heldReply();
  const next = client.request({ kind: "discard" });
  t.mock.timers.tick(499);
  assert.equal(client.slow, false, "Each new calculation gets the full delay");
  reply.resolve(response);
  await next;
});

function heldReply() {
  let resolve!: (reply: ModelReply) => void;
  const promise = new Promise<ModelReply>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
