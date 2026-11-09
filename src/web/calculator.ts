import {
  CalculationFailure,
  type CalculationFailureCode,
  calculationFailure,
} from "../model/calculation-failure.js";
import { calculationTimeoutMs } from "../model/calculation-limits.js";

/** Stateless WASM calculation; terminating its worker preserves the accepted document. */
export class NativeCalculator<Input, Output> {
  private worker: Worker | null = null;
  private pending: { resolve: (result: Output) => void; reject: (error: Error) => void } | null =
    null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private executable: string,
    private name: string,
    private deadlineMs = calculationTimeoutMs,
  ) {}
  calculate(input: Input, deadlineMs = this.deadlineMs): Promise<Output> {
    if (this.pending)
      return Promise.reject(new CalculationFailure("invalid-request", `${this.name} is busy`));
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      try {
        if (!this.worker) {
          this.worker = new Worker(new URL("./calculator-worker.ts", import.meta.url), {
            type: "module",
          });
          const worker = this.worker;
          worker.onmessage = (event: MessageEvent<{ result?: Output; error?: string }>) => {
            if (this.worker !== worker) return;
            if (typeof event.data.error === "string") {
              this.stop(event.data.error || `${this.name} calculation failed`);
              return;
            }
            const pending = this.pending;
            this.pending = null;
            clearTimeout(this.timer);
            const result = event.data.result as Output & { error?: string };
            if (typeof result?.error === "string")
              pending?.reject(
                calculationFailure(result as { error: string }, `${this.name} calculation failed`),
              );
            else pending?.resolve(event.data.result as Output);
          };
          worker.onerror = () => {
            if (this.worker === worker) this.stop(`${this.name} could not load or run. Try again.`);
          };
        }
        this.timer = setTimeout(
          () => this.stop(`${this.name} timed out after ${deadlineMs / 1000} seconds`, "timeout"),
          deadlineMs,
        );
        this.worker.postMessage({
          calculator: this.executable.includes("solver") ? "solver" : "kernel",
          input,
        });
      } catch (error) {
        this.stop(error instanceof Error ? error.message : String(error));
      }
    });
  }
  private stop(message: string, code: CalculationFailureCode = "internal"): void {
    clearTimeout(this.timer);
    this.worker?.terminate();
    this.worker = null;
    this.pending?.reject(new CalculationFailure(code, message));
    this.pending = null;
  }
  async cancel(): Promise<void> {
    if (this.pending) this.stop(`${this.name} cancelled`, "cancelled");
  }
  close(): void {
    this.stop(`${this.name} closed`, "cancelled");
  }
}
