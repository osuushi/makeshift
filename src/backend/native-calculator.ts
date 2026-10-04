import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { calculationTimeoutMs } from "../model/calculation-limits.js";

export class NativeCalculator<Input, Output> {
  private child: ChildProcessWithoutNullStreams | null = null;
  private pending: {
    resolve: (result: Output) => void;
    reject: (error: Error) => void;
  } | null = null;
  private stopping: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private executable: string,
    private name: string,
    private deadlineMs = calculationTimeoutMs,
  ) {
    this.executable = resolve(
      process.platform === "win32" && !executable.endsWith(".exe")
        ? `${executable}.exe`
        : executable,
    );
  }
  private start(): void {
    const child = spawn(this.executable, [], { stdio: "pipe", windowsHide: true });
    this.child = child;
    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      if (this.child !== child) return;
      const pending = this.pending;
      if (!pending) return;
      this.pending = null;
      clearTimeout(this.timer);
      try {
        const reply = JSON.parse(line) as Output & { error?: string };
        if (reply.error) pending.reject(new Error(reply.error, { cause: reply }));
        else pending.resolve(reply);
      } catch {
        pending.reject(new Error("Invalid native calculator reply"));
      }
    });
    child.stderr.on("data", (data: Buffer) => {
      if (process.env.MAKESHIFT_SOLVER_DEBUG || process.env.MAKESHIFT_KERNEL_TIMING)
        process.stderr.write(data);
    });
    const failed = () => {
      lines.close();
      if (this.child !== child) return;
      this.stop(`${this.name} stopped. Check native setup in README.md, then try again.`);
    };
    child.once("error", failed);
    child.once("exit", failed);
    child.stdin.on("error", failed);
  }
  calculate(input: Input): Promise<Output> {
    if (this.pending) return Promise.reject(new Error("Native calculator is busy"));
    return new Promise((resolve, reject) => {
      const pending = { resolve, reject };
      this.pending = pending;
      void this.launch(input, pending);
    });
  }
  private async launch(
    input: Input,
    pending: NonNullable<NativeCalculator<Input, Output>["pending"]>,
  ): Promise<void> {
    try {
      if (this.stopping) await this.stopping;
      if (this.pending !== pending) return;
      if (!this.child) this.start();
      this.timer = setTimeout(
        () => this.stop(`${this.name} timed out after ${this.deadlineMs / 1000} seconds`),
        this.deadlineMs,
      );
      this.child?.stdin.write(`${JSON.stringify(input)}\n`);
    } catch (error) {
      this.stop(error instanceof Error ? error.message : String(error));
    }
  }
  async cancel(): Promise<void> {
    if (this.pending) this.stop("Native calculation cancelled");
    await this.stopping;
  }
  private stop(message: string): void {
    clearTimeout(this.timer);
    this.pending?.reject(new Error(message));
    this.pending = null;
    const child = this.child;
    this.child = null;
    if (!child) return;
    // Detach replies immediately, but do not reuse the slot until the process has exited.
    this.stopping = new Promise<void>((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null || !child.pid) {
        resolve();
        return;
      }
      const force = setTimeout(() => child.kill("SIGKILL"), 250);
      child.once("exit", () => {
        clearTimeout(force);
        resolve();
      });
      child.kill();
    }).finally(() => {
      this.stopping = null;
    });
  }
  close(): void {
    this.stop("Native calculation cancelled");
  }
}
