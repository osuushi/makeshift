import assert from "node:assert/strict";
import test from "node:test";
import { PreviewRunner } from "../src/model/preview-runner.js";

function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve: () => resolve() };
}

test("a preview has one calculation and only its latest waiting target", async () => {
  const started = deferred(),
    release = deferred();
  const calculated: number[] = [],
    published: number[] = [],
    settled: boolean[] = [];
  let superseded = 0,
    active = 0;
  const runner = new PreviewRunner<number>({
    editing: () => true,
    calculate: async (request) => {
      assert.equal(active++, 0, "native calculations cannot overlap");
      calculated.push(request);
      if (request === 1) {
        started.resolve();
        await release.promise;
      }
      if (request === runner.latest) published.push(request);
      active--;
    },
    supersede: () => {
      superseded++;
    },
    settled: (calculated) => settled.push(calculated),
  });
  runner.enqueue(1);
  await started.promise;
  runner.enqueue(2);
  runner.enqueue(3);
  release.resolve();
  await runner.settle();
  assert.deepEqual(calculated, [1, 3]);
  assert.deepEqual(published, [3]);
  assert.equal(superseded, 2);
  assert.deepEqual(settled, [true]);
});

test("invalidating a target and closing its lease cannot resume pending calculation", async () => {
  const started = deferred(),
    release = deferred();
  let editing = true;
  let superseded = 0;
  const calculated: number[] = [],
    published: number[] = [];
  const runner = new PreviewRunner<number>({
    editing: () => editing,
    calculate: async (request) => {
      calculated.push(request);
      started.resolve();
      await release.promise;
      if (editing && request === runner.latest) published.push(request);
    },
    supersede: () => {
      superseded++;
    },
    settled: () => {},
  });
  runner.enqueue(1);
  await started.promise;
  runner.enqueue(2);
  editing = false;
  runner.clear();
  release.resolve();
  await runner.settle();
  assert.deepEqual(calculated, [1]);
  assert.deepEqual(published, []);
  assert.equal(runner.latest, null);
  assert.equal(superseded, 2, "Both a newer target and clearing it supersede deferred work");
});

test("a noninterrupting preview completes its running target and coalesces waiting input", async () => {
  const started = deferred(),
    release = deferred();
  const calculated: number[] = [];
  let active = 0;
  const runner = new PreviewRunner<number>({
    editing: () => true,
    calculate: async (request) => {
      assert.equal(active++, 0);
      calculated.push(request);
      if (request === 1) {
        started.resolve();
        await release.promise;
      }
      active--;
    },
    settled: () => {},
  });
  runner.enqueue(1);
  await started.promise;
  runner.enqueue(2);
  runner.enqueue(3);
  assert.deepEqual(calculated, [1]);
  assert.equal(runner.latest, 3);
  release.resolve();
  await runner.settle();
  assert.deepEqual(calculated, [1, 3]);
});

test("cleanup shares the calculation slot and does not reschedule itself", async () => {
  const started = deferred(),
    release = deferred();
  const order: string[] = [],
    settled: boolean[] = [];
  let superseded = 0;
  const runner = new PreviewRunner<number>({
    editing: () => true,
    calculate: async (request) => {
      order.push(`geometry ${request}`);
    },
    supersede: () => {
      superseded++;
    },
    settled: (calculated) => settled.push(calculated),
  });
  assert.equal(
    runner.check(async () => {
      order.push("cleanup start");
      started.resolve();
      await release.promise;
      order.push("cleanup end");
    }),
    true,
  );
  await started.promise;
  assert.equal(
    runner.check(async () => {
      throw new Error("overlapping cleanup");
    }),
    false,
  );
  runner.enqueue(4);
  release.resolve();
  await runner.settle();
  assert.deepEqual(order, ["cleanup start", "cleanup end", "geometry 4"]);
  assert.equal(superseded, 1);
  assert.deepEqual(settled, [true]);
  assert.equal(
    runner.check(async () => {}),
    true,
  );
  await runner.settle();
  assert.deepEqual(settled, [true, false], "only geometry settlement requests a new cleanup probe");
  runner.enqueue(5);
  await runner.settle();
  assert.equal(order.at(-1), "geometry 5", "an early-returning check releases its running slot");
});

test("failed calculation settles its slot and a subsequent target can recover", async () => {
  let fail = true;
  const runner = new PreviewRunner<number>({
    editing: () => true,
    calculate: async () => {
      if (fail) throw new Error("native failure");
    },
    supersede: () => {},
    settled: () => {},
  });
  runner.enqueue(1);
  await assert.rejects(runner.settle(), /native failure/);
  fail = false;
  runner.enqueue(2);
  await runner.settle();
  assert.equal(runner.latest, 2);
});
