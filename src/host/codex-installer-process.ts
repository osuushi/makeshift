import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);
export function installerEnvironment(inherited: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { CODEX_NON_INTERACTIVE: "1" };
  const allowed = new Set([
    "PATH",
    "HOME",
    "USERPROFILE",
    "LOCALAPPDATA",
    "SYSTEMROOT",
    "SYSTEMDRIVE",
    "COMSPEC",
    "PATHEXT",
    "TEMP",
    "TMP",
    "TMPDIR",
    "SHELL",
    "LANG",
    "LC_ALL",
  ]);
  for (const [key, value] of Object.entries(inherited))
    if (allowed.has(key.toUpperCase())) env[key] = value;
  return env;
}
export function installerCommand(platform: NodeJS.Platform, script: string) {
  return platform === "win32"
    ? {
        executable: "powershell.exe",
        args: [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          script,
        ],
      }
    : { executable: "/bin/sh", args: [script] };
}
export async function runInstaller(
  script: string,
  env: NodeJS.ProcessEnv,
  signal: AbortSignal,
  output: (text: string) => void,
): Promise<void> {
  signal.throwIfAborted();
  const { executable, args } = installerCommand(process.platform, script);
  const child = spawn(executable, args, {
    env,
    detached: process.platform !== "win32",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stop: Promise<void> | undefined;
  const cancel = () => {
    stop ??= (async () => {
      if (!child.pid) return;
      if (process.platform === "win32") {
        await execute("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
          timeout: 5000,
          windowsHide: true,
        }).catch(() => child.kill());
      } else {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
        }
      }
    })();
  };
  signal.addEventListener("abort", cancel, { once: true });
  child.stdout.on("data", (data: Buffer) => output(data.toString()));
  child.stderr.on("data", (data: Buffer) => output(data.toString()));
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    await stop;
    signal.throwIfAborted();
    if (code !== 0)
      throw new Error(
        `The official Codex installer exited with code ${code}. Check the installation output and retry.`,
      );
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}
