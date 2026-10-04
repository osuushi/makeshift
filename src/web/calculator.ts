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
  calculate(input: Input): Promise<Output> {
    if (this.pending) return Promise.reject(new Error(`${this.name} is busy`));
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
            if (event.data.error) {
              this.stop(event.data.error);
              return;
            }
            const pending = this.pending;
            this.pending = null;
            clearTimeout(this.timer);
            const result = event.data.result as Output & { error?: string };
            if (result?.error) pending?.reject(new Error(result.error, { cause: result }));
            else pending?.resolve(event.data.result as Output);
          };
          worker.onerror = () => {
            if (this.worker === worker) this.stop(`${this.name} could not load or run. Try again.`);
          };
        }
        this.timer = setTimeout(() => this.stop(`${this.name} timed out`), this.deadlineMs);
        this.worker.postMessage({
          calculator: this.executable.includes("solver") ? "solver" : "kernel",
          input,
        });
      } catch (error) {
        this.stop(error instanceof Error ? error.message : String(error));
      }
    });
  }
  private stop(message: string): void {
    clearTimeout(this.timer);
    this.worker?.terminate();
    this.worker = null;
    this.pending?.reject(new Error(message));
    this.pending = null;
  }
  async cancel(): Promise<void> {
    if (this.pending) this.stop(`${this.name} cancelled`);
  }
  close(): void {
    this.stop(`${this.name} closed`);
  }
}
