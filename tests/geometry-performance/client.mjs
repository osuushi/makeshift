import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";

// One request at a time; each benchmark process owns its native child.
export class Client {
  constructor(executable, threads) {
    this.child = spawn(executable, [], {
      env: {
        ...process.env,
        MAKESHIFT_KERNEL_THREADS: String(threads),
        MAKESHIFT_KERNEL_TIMING: "1",
      },
      stdio: "pipe",
    });
    this.stderr = "";
    this.child.stderr.on("data", (data) => {
      this.stderr += data;
    });
    this.lines = createInterface({ input: this.child.stdout });
    this.lines.on("line", (line) => {
      const pending = this.pending;
      if (!pending) return;
      this.pending = null;
      clearTimeout(pending.timer);
      try {
        pending.resolve(JSON.parse(line));
      } catch (error) {
        pending.reject(error);
      }
    });
    this.child.on("error", (error) => this.fail(error));
    this.child.stdin.on("error", (error) => this.fail(error));
    this.child.on("exit", (code, signal) =>
      this.fail(new Error(`Kernel exited: ${code}/${signal}`)),
    );
  }
  fail(error) {
    if (!this.pending) return;
    clearTimeout(this.pending.timer);
    this.pending.reject(error);
    this.pending = null;
  }
  async memory() {
    const pid = this.child.pid;
    if (!pid) return { available: false, reason: "Native child has no PID" };
    try {
      const status = await readFile(`/proc/${pid}/status`, "utf8");
      const values = {};
      for (const field of ["VmRSS", "VmHWM", "VmPeak", "Threads"]) {
        const match = new RegExp(`^${field}:\\s+(\\d+)`, "m").exec(status);
        values[field === "Threads" ? field : `${field}KiB`] = match ? Number(match[1]) : null;
      }
      return { pid, available: true, ...values };
    } catch {
      return { pid, available: false, reason: "Native /proc status unavailable" };
    }
  }
  async request(input) {
    if (this.pending) throw new Error("Concurrent benchmark request");
    this.stderr = "";
    const start = performance.now();
    const reply = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.fail(new Error("Benchmark request exceeded 180 seconds"));
        this.child.kill("SIGKILL");
      }, 180_000);
      this.pending = { resolve, reject, timer };
      this.child.stdin.write(`${JSON.stringify(input)}\n`);
    });
    const milliseconds = performance.now() - start;
    // Native timings finish on stderr immediately after the stdout reply.
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { reply, milliseconds, phases: this.stderr };
  }
  async close() {
    this.lines.close();
    if (this.child.exitCode !== null || this.child.signalCode !== null) return;
    await new Promise((resolve) => {
      this.child.once("exit", resolve);
      this.child.kill();
    });
  }
}

export function operand(result, id) {
  return {
    id,
    brep: result.brep,
    faces: result.faces.map((face, i) => ({ id: `${id}-f${i}`, signature: face.signature })),
    edges: result.edges.map((edge, i) => ({ id: `${id}-e${i}`, signature: edge.signature })),
  };
}

export function outcome(reply) {
  if (reply.error) return { error: reply.error };
  return {
    mode: reply.mode,
    participants: reply.participants,
    results: reply.results.map((result) => ({
      volume: result.volume,
      center: result.center,
      bounds: result.bounds,
      faces: result.faces.length,
      edges: result.edges.length,
      faceSignatures: result.faces.map((face) => face.signature),
      edgeSignatures: result.edges.map((edge) => edge.signature),
      faceOrigins: result.faces.map((face) => face.predecessors),
      edgeOrigins: result.edges.map((edge) => edge.predecessors),
    })),
  };
}
