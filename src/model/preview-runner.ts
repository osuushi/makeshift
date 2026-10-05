interface PreviewCallbacks<Request> {
  editing: () => boolean;
  calculate: (request: Request) => Promise<void>;
  supersede: () => void;
  settled: (calculated: boolean) => void;
}

/** Serial tool calculations plus one replaceable target; tools own validity and presentation. */
export class PreviewRunner<Request> {
  private pending: Request | null = null;
  private current: Request | null = null;
  private running: Promise<void> | null = null;
  constructor(private callbacks: PreviewCallbacks<Request>) {}

  get latest(): Request | null {
    return this.current;
  }

  enqueue(request: Request): void {
    this.current = this.pending = request;
    if (this.running) this.callbacks.supersede();
    else this.start();
  }

  clear(): void {
    this.current = this.pending = null;
  }

  /** Selection queries share the same serial slot; pending geometry follows them. */
  check(task: () => Promise<void>): boolean {
    if (this.running || !this.callbacks.editing()) return false;
    this.start(task);
    return true;
  }

  async settle(): Promise<void> {
    while (this.running) await this.running;
  }

  private start(check?: () => Promise<void>): void {
    // Install the running slot before an early-returning check can finish.
    this.running = Promise.resolve().then(async () => {
      let calculated = false;
      try {
        if (check && this.callbacks.editing()) await check();
        while (this.pending && this.callbacks.editing()) {
          const request = this.pending;
          this.pending = null;
          calculated = true;
          await this.callbacks.calculate(request);
        }
      } finally {
        this.running = null;
        this.callbacks.settled(calculated);
      }
    });
  }
}
