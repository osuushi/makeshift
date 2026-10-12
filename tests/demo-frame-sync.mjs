import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout } from "node:timers/promises";
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
