import assert from "node:assert/strict";
import test from "node:test";
import { CalculationFailure } from "../src/model/calculation-failure.js";
import { NativeCalculator } from "../src/web/calculator.js";

/** Control transport completion, not geometry; native cases cover real shape failures. */
class ControlledWorker {
  static current: ControlledWorker;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  terminated = false;
  constructor() {
    ControlledWorker.current = this;
  }
  postMessage() {}
  terminate() {
    this.terminated = true;
  }
  reply(data: unknown) {
    this.onmessage?.({ data });
  }
}

test("web calculator rejects empty envelopes, preserves typed failure, and ignores a cancelled worker", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "Worker");
  Object.defineProperty(globalThis, "Worker", { configurable: true, value: ControlledWorker });
  const calculator = new NativeCalculator<Record<string, never>, { value: number }>(
    "kernel",
    "Test kernel",
  );
  try {
    for (const code of ["geometric-infeasibility", "timeout", "future-code"]) {
      const pending = calculator.calculate({});
      const rejected = assert.rejects(pending, (error) => {
        assert.ok(error instanceof CalculationFailure);
        assert.equal(error.code, code === "future-code" ? "internal" : code);
        assert.equal(error.message, "Test kernel calculation failed");
        return true;
      });
      ControlledWorker.current.reply({ result: { error: "", code } });
      await rejected;
    }
    const crashed = calculator.calculate({});
    const crash = assert.rejects(
      crashed,
      (error) => error instanceof CalculationFailure && error.code === "internal",
    );
    ControlledWorker.current.reply({ error: "" });
    await crash;
    assert.equal(ControlledWorker.current.terminated, true);
    const pending = calculator.calculate({});
    const old = ControlledWorker.current;
    const cancelled = assert.rejects(
      pending,
      (error) => error instanceof CalculationFailure && error.code === "cancelled",
    );
    await calculator.cancel();
    await cancelled;
    const next = calculator.calculate({});
    old.reply({ result: { value: 1 } });
    ControlledWorker.current.reply({ result: { value: 2 } });
    assert.deepEqual(await next, { value: 2 });
    const timeout = calculator.calculate({}, 1);
    await assert.rejects(
      timeout,
      (error) => error instanceof CalculationFailure && error.code === "timeout",
    );
    assert.equal(ControlledWorker.current.terminated, true);
  } finally {
    calculator.close();
    if (descriptor) Object.defineProperty(globalThis, "Worker", descriptor);
    else Reflect.deleteProperty(globalThis, "Worker");
  }
});
