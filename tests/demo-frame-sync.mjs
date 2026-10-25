import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout } from "node:timers/promises";
import { runInNewContext } from "node:vm";
import { FixedStepCapture } from "../.agents/skills/playwright-demo/scripts/fixed-step-capture.mjs";
import { syncKernel } from "../scripts/demos/kernel-sync.mjs";

test("every demo frame waits for slow kernel work after its clock step", async () => {
  let pending = false;
  const steps = [];
  const page = {
    clock: {
      runFor: async (milliseconds) => {
        steps.push(milliseconds);
        pending = true;
        setTimeout(25).then(() => {
          pending = false;
        });
      },
    },
    evaluate: async () => !pending,
    screenshot: async () => assert.equal(pending, false),
  };
  const capture = new FixedStepCapture(page, "unused", 30, () => syncKernel(page));
  await capture.frame();
  await capture.hold(2 / 30);
  assert.equal(capture.frames, 3);
  assert.deepEqual(steps, [33, 33, 34]);
});

test("a stalled kernel fails capture without saving or counting a frame", async () => {
  const page = {
    clock: { runFor: async () => {} },
    evaluate: async () => false,
    screenshot: async () => assert.fail("Must not capture an unfinished preview"),
  };
  const capture = new FixedStepCapture(page, "unused", 30, () => syncKernel(page, 20));
  await assert.rejects(capture.frame(), /Kernel did not settle/);
  assert.equal(capture.frames, 0);
});

test("staged meshes are captured while fixed frames release deferred metadata", async () => {
  const state = { busy: true, solving: true, visualPreview: null };
  const steps = [],
    captures = [];
  const page = {
    clock: {
      runFor: async (milliseconds) => {
        steps.push(milliseconds);
        if (steps.length === 1)
          setTimeout(25).then(() => {
            state.visualPreview = { bodies: [{}] };
          });
        if (steps.length === 3) {
          state.busy = state.solving = false;
          state.visualPreview = null;
        }
      },
    },
    evaluate: async (read) =>
      runInNewContext(`(${read})()`, {
        window: { makeshiftInspect: () => state },
      }),
    screenshot: async () => {
      assert.ok(!state.busy || state.visualPreview?.bodies.length);
      captures.push(state.visualPreview ? "mesh" : "complete");
    },
  };
  const capture = new FixedStepCapture(page, "unused", 30, () => syncKernel(page, 200));
  await capture.hold(3 / 30);
  assert.deepEqual(steps, [33, 33, 34]);
  assert.deepEqual(captures, ["mesh", "mesh", "complete"]);
  assert.equal(capture.frames, 3);
});
