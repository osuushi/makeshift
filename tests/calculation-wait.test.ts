import assert from "node:assert/strict";
import test from "node:test";
import { waitForCalculation } from "../src/sketch/calculation-wait.js";

function pending() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test("calculations finishing within the grace period do not prompt", async () => {
  assert.equal(
    await waitForCalculation(Promise.resolve(), () => {
      throw new Error("Unexpected prompt");
    }),
    true,
  );
});

for (const wait of [true, false]) {
  test(`slow calculations prompt once and ${wait ? "wait" : "cancel"} explicitly`, async () => {
    const calculation = pending(),
      shown = pending();
    let disposed = 0;
    const result = waitForCalculation(
      calculation.promise,
      () => {
        shown.resolve();
        return {
          choice: Promise.resolve(wait),
          dispose: () => {
            disposed++;
          },
        };
      },
      5,
    );
    await shown.promise;
    if (wait) {
      let completed = false;
      void result.then(() => {
        completed = true;
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.equal(completed, false);
      calculation.resolve();
    }
    assert.equal(await result, wait);
    assert.equal(disposed, 1);
    calculation.resolve();
  });
}

test("a completed calculation dismisses the prompt and proceeds", async () => {
  const calculation = pending(),
    shown = pending();
  let disposed = false;
  const result = waitForCalculation(
    calculation.promise,
    () => {
      shown.resolve();
      return {
        choice: new Promise<boolean>(() => {}),
        dispose: () => {
          disposed = true;
        },
      };
    },
    5,
  );
  await shown.promise;
  calculation.resolve();
  assert.equal(await result, true);
  assert.equal(disposed, true);
});

test("failure while prompting releases the dialog and preserves the error", async () => {
  const calculation = pending(),
    shown = pending();
  let disposed = false;
  const result = waitForCalculation(
    calculation.promise,
    () => {
      shown.resolve();
      return {
        choice: new Promise<boolean>(() => {}),
        dispose: () => {
          disposed = true;
        },
      };
    },
    5,
  );
  const assertion = assert.rejects(result, /failed/);
  await shown.promise;
  calculation.reject(new Error("failed"));
  await assertion;
  assert.equal(disposed, true);
});
