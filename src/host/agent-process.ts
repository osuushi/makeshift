import { resolve } from "node:path";
import { type IPty, spawn } from "node-pty";
import type { AgentStatus } from "../agent/protocol.js";
import { AgentProcessScope } from "./agent-process-scope.js";

/** One PTY; backpressure bounds output while a renderer is absent or collapsed. */
export class AgentProcess {
  constructor(private scopeExecutable = resolve(".build/host-native/bin/makeshift-agent-scope")) {}
  private pty: IPty | null = null;
  private output = "";
  private paused = false;
  private exitCode: number | undefined;
  private error: string | undefined;
  private exited: Promise<void> = Promise.resolve();
  private scope: AgentProcessScope | null = null;
  private stopping: Promise<void> | null = null;
  private starting = false;
  private readers = new Set<() => void>();
  get status(): Omit<AgentStatus, "workspace"> {
    return {
      running: this.starting || !!this.pty || !!this.scope,
      exitCode: this.exitCode,
      error: this.error,
    };
  }
  async start(
    executable: string,
    args: string[],
    cwd: string,
    env: NodeJS.ProcessEnv,
    cols: number,
    rows: number,
  ): Promise<void> {
    if (this.pty || this.scope || this.starting) throw new Error("The agent is already running.");
    this.starting = true;
    try {
      this.error = undefined;
      this.exitCode = undefined;
      this.output = "";
      this.paused = false;
      const scope =
        process.platform === "win32" ? null : await AgentProcessScope.prepare(this.scopeExecutable);
      let pty: IPty;
      try {
        pty = spawn(scope ? "/bin/sh" : executable, scope?.arguments(executable, args) ?? args, {
          cwd,
          env,
          cols,
          rows,
          name: "xterm-256color",
        });
      } catch (error) {
        await scope?.dispose();
        throw error;
      }
      this.pty = pty;
      this.scope = scope;
      this.exited = new Promise((resolve) => {
        pty.onData((data) => {
          this.output += data;
          this.wakeReaders();
          if (this.output.length > 128 * 1024 && !this.paused) {
            pty.pause();
            this.paused = true;
          }
        });
        pty.onExit(({ exitCode }) => {
          this.exitCode = exitCode;
          if (this.pty === pty) this.pty = null;
          this.wakeReaders();
          resolve();
          void this.stop().catch((error: unknown) => {
            this.error = error instanceof Error ? error.message : String(error);
          });
        });
      });
      try {
        await scope?.release(pty.pid);
      } catch (error) {
        // The launch gate still holds the owned PTY root and its group here.
        if (scope) {
          try {
            process.kill(-pty.pid, "SIGKILL");
          } catch {}
        } else pty.kill("SIGKILL");
        await this.exited;
        await scope?.dispose();
        this.scope = null;
        throw error;
      }
    } finally {
      this.starting = false;
    }
  }
  read(): string {
    const output = this.output;
    this.output = "";
    if (this.paused) {
      this.pty?.resume();
      this.paused = false;
    }
    return output;
  }
  /** Long-poll without delaying echoed keystrokes or spinning while the PTY is idle. */
  waitForOutput(): Promise<void> {
    if (this.output || !this.pty) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.readers.delete(done);
        resolve();
      };
      const timer = setTimeout(done, 1000);
      this.readers.add(done);
    });
  }
  private wakeReaders(): void {
    for (const done of this.readers) done();
  }
  write(data: string): void {
    if (!this.pty) throw new Error("Start the agent first.");
    this.pty.write(data);
  }
  resize(cols: number, rows: number): void {
    this.pty?.resize(cols, rows);
  }
  stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    const pty = this.pty;
    const scope = this.scope;
    if (!pty && !scope) return Promise.resolve();
    this.stopping = this.stopOwned(pty, scope).finally(() => {
      this.stopping = null;
    });
    return this.stopping;
  }
  private async stopOwned(pty: IPty | null, scope: AgentProcessScope | null): Promise<void> {
    // Resume a throttled process before asking it to exit.
    if (this.paused && pty) {
      pty.resume();
      this.paused = false;
    }
    if (scope) await scope.stop();
    else pty?.kill();
    await this.exited;
    await scope?.dispose();
    if (this.scope === scope) this.scope = null;
  }
}
