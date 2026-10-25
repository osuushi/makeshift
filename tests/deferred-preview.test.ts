import assert from "node:assert/strict";
import test from "node:test";
import { DeferredPreview } from "../src/sketch/deferred-preview.js";
import type { ModelCall, ModelReply, ModelRequest } from "../src/sketch/model-api.js";

const visual: ModelReply = {
  view: {
    data: { units: "mm", sketches: [] },
    candidate: null,
    canUndo: false,
    canRedo: false,
    solveCount: 0,
    solveMs: 0,
    visualPreview: { bodies: [] },
  },
};
const request: ModelRequest = {
  kind: "move-edges",
  presentation: "deferred",
  operation: { edges: [], translation: [2, 0, 0] },
};

test("edge finishes publish a provisional mesh without requesting completion or a paint wait", async () => {
  const clock = frames(),
    preview = new DeferredPreview();
  const events: string[] = [];
  try {
    const reply = await preview.run(
      {
        kind: "finish-edges",
        presentation: "deferred",
        operation: { edges: [], mode: "fillet", size: 2 },
      },
      async (request) => {
        events.push(request.kind);
        return visual;
      },
      () => events.push("mesh"),
    );
    assert.equal(reply, visual);
    assert.deepEqual(events, ["finish-edges", "mesh"]);
    assert.equal(clock.pending, 0);
    assert.equal(preview.supersede(), false);
  } finally {
    clock.restore();
  }
});

function frames() {
  const original = ["requestAnimationFrame", "cancelAnimationFrame"].map((name) =>
    Object.getOwnPropertyDescriptor(globalThis, name),
  );
  const pending = new Map<number, FrameRequestCallback>();
  let id = 0;
  globalThis.requestAnimationFrame = (callback) => {
    pending.set(++id, callback);
    return id;
  };
  globalThis.cancelAnimationFrame = (key) => {
    pending.delete(key);
  };
  return {
    paint() {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const callback of callbacks) callback(performance.now());
    },
    restore() {
      ["requestAnimationFrame", "cancelAnimationFrame"].forEach((name, i) => {
        const descriptor = original[i];
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      });
    },
    get pending() {
      return pending.size;
    },
  };
}

test("mesh publication gets a paint opportunity before exact presentation starts", async () => {
  const clock = frames(),
    preview = new DeferredPreview();
  const events: string[] = [];
  const call: ModelCall = async (request) => {
    events.push(request.kind);
    return visual;
  };
  try {
    const pending = preview.run(request, call, () => events.push("mesh"));
    await Promise.resolve();
    assert.deepEqual(events, ["move-edges", "mesh"]);
    clock.paint();
    await Promise.resolve();
    assert.deepEqual(events, ["move-edges", "mesh"]);
    clock.paint();
    await pending;
    assert.deepEqual(events, ["move-edges", "mesh", "complete-preview"]);
  } finally {
    clock.restore();
  }
});

test("new input during paint skips metadata and releases the frame wait immediately", async () => {
  const clock = frames(),
    preview = new DeferredPreview();
  const calls: string[] = [];
  try {
    const pending = preview.run(
      request,
      async (request) => {
        calls.push(request.kind);
        return visual;
      },
      () => {},
    );
    const rejected = assert.rejects(pending, /Preview superseded/);
    await Promise.resolve();
    assert.equal(clock.pending, 1);
    assert.equal(preview.supersede(), false);
    await rejected;
    assert.equal(clock.pending, 0);
    assert.deepEqual(calls, ["move-edges"]);
  } finally {
    clock.restore();
  }
});

test("in-flight geometry may draw, but only in-flight completion requests interruption", async () => {
  const clock = frames();
  let resolve: (reply: ModelReply) => void = () => {};
  const gate = new Promise<ModelReply>((done) => {
    resolve = done;
  });
  try {
    const early = new DeferredPreview();
    let drawn = false;
    const pending = early.run(
      request,
      () => gate,
      () => {
        drawn = true;
      },
    );
    const rejected = assert.rejects(pending, /Preview superseded/);
    assert.equal(early.supersede(), false);
    resolve(visual);
    await rejected;
    assert.equal(drawn, true);
    const late = new DeferredPreview();
    const completed = late.run(
      request,
      async () => visual,
      () => {},
    );
    await Promise.resolve();
    clock.paint();
    clock.paint();
    await Promise.resolve();
    assert.equal(late.supersede(), true);
    await completed;
  } finally {
    resolve(visual);
    clock.restore();
  }
});
