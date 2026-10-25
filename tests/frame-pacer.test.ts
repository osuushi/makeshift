import assert from "node:assert/strict";
import test from "node:test";
import { FramePacer } from "../src/sketch/frame-pacer.js";

function fixture(t: test.TestContext) {
  const frames = new Map<number, FrameRequestCallback>();
  let id = 0;
  t.mock.method(globalThis, "requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++id, callback);
    return id;
  });
  t.mock.method(globalThis, "cancelAnimationFrame", (key: number) => frames.delete(key));
  let ready = true,
    busy = false,
    lost = false,
    submissions = 0,
    deletions = 0;
  const gl = {
    TIMEOUT_EXPIRED: 1,
    CONDITION_SATISFIED: 2,
    SYNC_GPU_COMMANDS_COMPLETE: 3,
    isContextLost: () => lost,
    clientWaitSync: (_sync: unknown, flags: number, timeout: number) => {
      assert.equal(flags, 0);
      assert.equal(timeout, 0, "Never block the input thread waiting for the GPU");
      return busy ? 1 : 2;
    },
    fenceSync: () => {
      submissions++;
      return {};
    },
    deleteSync: () => {
      deletions++;
    },
    flush: () => {},
  };
  return {
    pacer: new FramePacer(gl as unknown as WebGL2RenderingContext, () => ready),
    frames,
    ready: (value: boolean) => {
      ready = value;
    },
    busy: (value: boolean) => {
      busy = value;
    },
    lost: (value: boolean) => {
      lost = value;
    },
    counts: () => ({ submissions, deletions }),
    tick: () => {
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback(0);
    },
  };
}

// Node has no animation frame globals; install only for this scheduler's isolated tests.
Object.assign(globalThis, { requestAnimationFrame: () => 0, cancelAnimationFrame: () => {} });

test("slow GPU retains only the newest presentation without discarding input state", (t) => {
  const f = fixture(t);
  const painted: number[] = [];
  f.pacer.request(() => painted.push(0));
  f.busy(true);
  for (let input = 1; input <= 100; input++) {
    f.pacer.request(() => painted.push(input));
    assert.equal(f.frames.size, 1);
    if (input % 10 === 0) f.tick();
  }
  assert.deepEqual(painted, [0]);
  assert.equal(f.pacer.pending, true);
  f.busy(false);
  f.tick();
  assert.deepEqual(painted, [0, 100]);
  assert.equal(f.pacer.pending, false);
  assert.equal(f.frames.size, 0, "No stale-frame tail after the latest state is painted");
  assert.deepEqual(f.counts(), { submissions: 2, deletions: 1 });
  f.pacer.reset();
  assert.deepEqual(f.counts(), { submissions: 2, deletions: 2 });
});

test("capture, disposal and context loss retire pending frames and fences", (t) => {
  const f = fixture(t);
  const painted: string[] = [];
  f.pacer.request(() => painted.push("first"));
  f.busy(true);
  f.pacer.request(() => painted.push("stale"));
  f.pacer.request(() => painted.push("capture"), true);
  assert.deepEqual(painted, ["first", "capture"]);
  assert.equal(f.frames.size, 0);
  f.pacer.request(() => painted.push("lost"));
  f.lost(true);
  f.tick();
  assert.equal(f.pacer.pending, false);
  f.lost(false);
  f.pacer.request(() => painted.push("restored"));
  f.pacer.request(() => painted.push("disposed"));
  f.pacer.reset();
  f.tick();
  assert.deepEqual(painted, ["first", "capture", "restored"]);
  assert.equal(f.frames.size, 0);
});

test("a ready GPU waits for camera-dependent scene updates before presenting", (t) => {
  const f = fixture(t);
  const painted: string[] = [];
  f.ready(false);
  f.pacer.request(() => painted.push("old grids"));
  f.tick();
  assert.equal(painted.length, 0);
  f.pacer.request(() => painted.push("updated grids"));
  f.ready(true);
  f.tick();
  assert.deepEqual(painted, ["updated grids"]);
  f.ready(false);
  f.pacer.request(() => painted.push("explicit capture"), true);
  assert.deepEqual(painted, ["updated grids", "explicit capture"]);
  f.pacer.reset();
});
