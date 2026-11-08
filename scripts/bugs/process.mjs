import { spawn } from "node:child_process";
export function command(program, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { stdio: "inherit", shell: false, ...options });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${program} exited ${code}`)),
    );
  });
}
export const ffmpegCommand = (program) => (args) =>
  command(program, ["-hide_banner", "-loglevel", "error", "-nostdin", "-n", ...args]);
