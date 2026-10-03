import { type ExecFileOptions, execFile } from "node:child_process";
import { homedir } from "node:os";
import { join, win32 } from "node:path";
import { promisify } from "node:util";
import type { AgentPreferences, CodexExecutable } from "../agent/protocol.js";
import { agentExecutable } from "./agent-executable.js";
import { installerEnvironment } from "./codex-installer-process.js";

const execute = promisify(execFile);
export interface CodexDiscoveryOptions {
  platform?: NodeJS.Platform;
  home?: string;
  localAppData?: string;
  probe?: (path: string, env: NodeJS.ProcessEnv) => Promise<string>;
  resolve?: typeof agentExecutable;
  systemRoot?: string;
  probeRunner?: (
    executable: string,
    args: string[],
    options: Pick<
      ExecFileOptions,
      "env" | "timeout" | "killSignal" | "maxBuffer" | "windowsHide" | "windowsVerbatimArguments"
    > & { encoding: "utf8" },
  ) => Promise<{ stdout: string }>;
}
/** Current Makeshift portability/runtime contract is checked against CLI 0.155.1. */
export function codexVersion(output: string): string {
  const version = /^codex-cli (\d+)\.(\d+)\.(\d+)(?:[-+][\w.-]+)?\s*$/m.exec(output.trim());
  if (!version) throw new Error("The executable did not identify itself as Codex CLI.");
  const [major, minor, patch] = version.slice(1).map(Number);
  if (major === 0 && (minor < 155 || (minor === 155 && patch < 1)))
    throw new Error("Makeshift requires Codex CLI 0.155.1 or newer. Install or update Codex.");
  return version[0].trim().slice("codex-cli ".length);
}
export function standaloneCodexPath(
  platform: NodeJS.Platform,
  home: string,
  localAppData?: string,
) {
  return platform === "win32"
    ? win32.join(
        localAppData ?? win32.join(home, "AppData", "Local"),
        "Programs",
        "OpenAI",
        "Codex",
        "bin",
        "codex.exe",
      )
    : join(home, ".local", "bin", "codex");
}
function probeCommand(path: string, options: CodexDiscoveryOptions) {
  if ((options.platform ?? process.platform) !== "win32" || !/\.(cmd|bat)$/i.test(path))
    return { executable: path, args: ["--version"], windowsVerbatimArguments: false };
  if (/[\0"\r\n%!&|<>^]/.test(path) || !win32.isAbsolute(path))
    throw new Error(
      "This Windows Codex wrapper path contains unsupported command characters. Browse to codex.exe or use the standalone installer.",
    );
  const root = options.systemRoot ?? process.env.SystemRoot ?? process.env.SYSTEMROOT;
  if (!root || !win32.isAbsolute(root))
    throw new Error(
      "The Windows system command directory was not available. Browse to codex.exe or use the standalone installer.",
    );
  return {
    executable: win32.join(root, "System32", "cmd.exe"),
    args: ["/d", "/s", "/c", `""${path}" --version"`],
    windowsVerbatimArguments: true,
  };
}
async function probeCodex(
  path: string,
  env: NodeJS.ProcessEnv,
  options: CodexDiscoveryOptions,
): Promise<string> {
  const command = probeCommand(path, options);
  const { stdout } = await (options.probeRunner ?? execute)(command.executable, command.args, {
    encoding: "utf8",
    windowsVerbatimArguments: command.windowsVerbatimArguments,
    env: installerEnvironment(env),
    timeout: 5000,
    killSignal: "SIGKILL",
    maxBuffer: 8192,
    windowsHide: true,
  });
  return stdout;
}
export async function discoverCodex(
  preferences: AgentPreferences,
  cwd: string,
  env: NodeJS.ProcessEnv,
  options: CodexDiscoveryOptions = {},
): Promise<CodexExecutable> {
  const platform = options.platform ?? process.platform,
    home = options.home ?? homedir();
  const resolve = options.resolve ?? agentExecutable,
    probe =
      options.probe ?? ((path: string, env: NodeJS.ProcessEnv) => probeCodex(path, env, options));
  const candidates: { path: string; source: CodexExecutable["source"] }[] = [
    { path: preferences.executable, source: "configured" },
  ];
  if (preferences.executable === "codex") {
    candidates.push({
      path: standaloneCodexPath(platform, home, options.localAppData ?? env.LOCALAPPDATA),
      source: "standalone",
    });
    if (platform === "darwin")
      for (const root of ["/Applications", join(home, "Applications")])
        candidates.push({
          path: join(root, "ChatGPT.app", "Contents", "Resources", "codex-cli", "bin", "codex"),
          source: "application",
        });
  }
  let failure = "Codex CLI was not found. Find an existing executable or install Codex.";
  for (const candidate of candidates) {
    try {
      const path = await resolve(candidate.path, cwd, env);
      return { path, version: codexVersion(await probe(path, env)), source: candidate.source };
    } catch (error) {
      if (candidates.length === 1)
        throw new Error(
          `Cannot use the configured Codex path. ${error instanceof Error ? error.message : String(error)}`,
        );
      if (
        candidate.source === "configured" &&
        error instanceof Error &&
        !error.message.includes("not found")
      )
        failure = error.message;
    }
  }
  throw new Error(failure);
}
