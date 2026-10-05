import { homedir } from "node:os";
import type { App } from "electron";
import type {
  AgentPreferences,
  AgentRequest,
  CodexExecutable,
  CodexSetupStatus,
} from "../agent/protocol.js";
import { type AgentSettings, agentPreferences } from "./agent-settings.js";
import { discoverCodex } from "./codex-discovery.js";
import { CodexInstaller } from "./codex-installer.js";

export class AgentSetup {
  private discovered: CodexSetupStatus | null = null;
  constructor(
    private settings: AgentSettings,
    app: App,
    readonly installer = new CodexInstaller(),
  ) {
    app.on("before-quit", (event) => {
      if (!this.active) return;
      event.preventDefault();
      void this.installer
        .cancel()
        .then(() => app.quit())
        .catch(console.error);
    });
  }
  conflicts(request: AgentRequest): boolean {
    return (
      this.active &&
      ["start", "configure", "discover-codex", "install-codex"].includes(request.kind)
    );
  }
  get status(): CodexSetupStatus {
    return this.discovered ?? this.installer.status;
  }
  get active(): boolean {
    return this.installer.active;
  }
  async executable(
    preferences: AgentPreferences,
    cwd: string,
    env: NodeJS.ProcessEnv,
  ): Promise<string> {
    const executable = await discoverCodex(preferences, cwd, env);
    this.verified(executable);
    return executable.path;
  }
  private verified(executable: CodexExecutable): void {
    this.discovered = {
      phase: "ready",
      message: `Found Codex CLI ${executable.version}. Use Start in the terminal header and sign in using Makeshift’s separate configuration.`,
      executable,
      output: "",
    };
  }
  async request(request: AgentRequest, running = false): Promise<boolean> {
    if (request.kind === "cancel-codex-install") {
      await this.installer.cancel();
      return true;
    }
    if (request.kind === "install-codex") {
      if (running) throw new Error("Stop the agent before installing Codex.");
      this.discovered = null;
      this.installer.start();
      return true;
    }
    if (request.kind !== "discover-codex") return false;
    if (this.active)
      throw new Error("Wait for or cancel Codex installation before changing setup.");
    const preferences = agentPreferences(request.preferences);
    if (preferences.preset !== "codex")
      throw new Error(
        "Codex discovery applies to the Codex preset. Custom executable paths are unchanged.",
      );
    const env = await this.settings.environment(preferences);
    let executable: CodexExecutable;
    try {
      executable = await discoverCodex(preferences, homedir(), env);
    } catch (error) {
      this.discovered = {
        phase: "failed",
        message: `${error instanceof Error ? error.message : String(error)} Browse to a usable Codex CLI or install the standalone CLI.`,
        output: "",
      };
      throw error;
    }
    this.verified(executable);
    return true;
  }
}
