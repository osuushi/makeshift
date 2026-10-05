import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { CodexSetupStatus } from "../agent/protocol.js";
import { discoverCodex, standaloneCodexPath } from "./codex-discovery.js";
import { installerEnvironment, runInstaller } from "./codex-installer-process.js";

export interface CodexInstallerOptions {
  fetch?: typeof fetch;
  run?: typeof runInstaller;
  verify?: typeof discoverCodex;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  home?: string;
  timeout?: number;
}
/** Explicit vendor installer only: URLs and process arguments never come from the renderer. */
export class CodexInstaller {
  status: CodexSetupStatus = {
    phase: "idle",
    message: "Find Codex or install the standalone CLI.",
    output: "",
  };
  private cancelled = false;
  private abort: AbortController | null = null;
  private running: Promise<void> | null = null;
  constructor(private options: CodexInstallerOptions = {}) {}
  get active(): boolean {
    return this.running !== null;
  }
  start(): void {
    if (this.active) throw new Error("Codex installation is already in progress.");
    this.cancelled = false;
    this.abort = new AbortController();
    this.status = {
      phase: "downloading",
      message: "Downloading the official Codex installer…",
      output: "",
    };
    this.running = this.install(this.abort.signal)
      .catch((error: unknown) => {
        const cancelled = this.cancelled;
        this.status = {
          ...this.status,
          phase: cancelled ? "cancelled" : "failed",
          message: cancelled
            ? "Codex installation cancelled. A partial vendor installation may remain; Retry resumes the official installer."
            : `${error instanceof Error ? error.message : String(error)} Retry installation or Browse to an existing Codex CLI.`,
        };
      })
      .finally(() => {
        this.running = null;
        this.abort = null;
      });
  }
  async cancel(): Promise<void> {
    this.cancelled = true;
    this.abort?.abort(new Error("Codex installation cancelled."));
    await this.running;
  }
  private async install(signal: AbortSignal): Promise<void> {
    const platform = this.options.platform ?? process.platform;
    const env = installerEnvironment(this.options.env ?? process.env);
    const suffix = platform === "win32" ? "ps1" : "sh";
    const timeout = setTimeout(
      () =>
        this.abort?.abort(
          new Error(
            "Codex installation exceeded its eight-minute limit. Retry on a working connection.",
          ),
        ),
      this.options.timeout ?? 8 * 60 * 1000,
    );
    let directory: string | undefined;
    try {
      directory = await mkdtemp(join(tmpdir(), "makeshift-codex-install-"));
      const response = await (this.options.fetch ?? fetch)(
        `https://chatgpt.com/codex/install.${suffix}`,
        { signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]) },
      );
      if (!response.ok)
        throw new Error(`Could not download the official installer (HTTP ${response.status}).`);
      const reader = response.body?.getReader();
      if (!reader) throw new Error("The official installer download was empty.");
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const result = await reader.read();
          if (result.done) break;
          size += result.value.length;
          if (size > 2 * 1024 * 1024)
            throw new Error("The official installer download exceeded its size limit.");
          chunks.push(result.value);
        }
      } finally {
        await reader.cancel();
      }
      signal.throwIfAborted();
      if (!size) throw new Error("The official installer download was empty.");
      const script = join(directory, `install.${suffix}`);
      await writeFile(script, Buffer.concat(chunks), { mode: 0o600, flag: "wx" });
      this.status = {
        ...this.status,
        phase: "installing",
        message: "Installing Codex CLI with the official standalone installer…",
      };
      await (this.options.run ?? runInstaller)(script, env, signal, (output) => {
        this.status.output = (this.status.output + output).slice(-16384);
      });
      signal.throwIfAborted();
      this.status = {
        ...this.status,
        phase: "verifying",
        message: "Verifying the installed Codex CLI…",
      };
      const home = this.options.home ?? homedir();
      const path = standaloneCodexPath(platform, home, env.LOCALAPPDATA);
      const executable = await (this.options.verify ?? discoverCodex)(
        { preset: "codex", executable: path, args: [], env: {} },
        directory,
        env,
      );
      signal.throwIfAborted();
      this.status = {
        ...this.status,
        phase: "ready",
        message: `Codex CLI ${executable.version} is ready. Launch Codex and sign in using Makeshift’s separate configuration.`,
        executable,
      };
    } finally {
      clearTimeout(timeout);
      if (directory) await rm(directory, { recursive: true, force: true });
    }
  }
}
