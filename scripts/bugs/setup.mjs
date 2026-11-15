import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

import { cp, mkdir, readFile } from "node:fs/promises";

import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runtimeCache, toolCache } from "./cache.mjs";
import { command } from "./process.mjs";
import { resolveWhisper } from "./whisper.mjs";

export { resolveWhisper, toolCache };

const works = (path, flag) =>
  spawnSync(path, [flag], { stdio: "ignore", timeout: 10000 }).status === 0;

export async function resolveFFmpeg(install = true) {
  if (process.env.MAKESHIFT_FFMPEG && works(process.env.MAKESHIFT_FFMPEG, "-version"))
    return process.env.MAKESHIFT_FFMPEG;
  if (works("ffmpeg", "-version")) return "ffmpeg";
  const pin = createHash("sha256")
    .update(await readFile(join(import.meta.dirname, "tools/package-lock.json")))
    .digest("hex")
    .slice(0, 16);
  const directory = join(runtimeCache, `ffmpeg-${pin}`);
  const executable = join(
    directory,
    "node_modules/ffmpeg-static",
    process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg",
  );
  if (works(executable, "-version")) return executable;
  if (!install)
    throw new Error("FFmpeg unavailable; run npm run bug:setup or set MAKESHIFT_FFMPEG");
  console.log("Installing pinned FFmpeg in the shared tool cache (no system changes)…");
  await mkdir(directory, { recursive: true });
  for (const file of ["package.json", "package-lock.json"])
    await cp(join(import.meta.dirname, "tools", file), join(directory, file));
  // npm's CLI is JavaScript, so no shell or platform-specific .cmd invocation is needed.
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error("Run npm run bug:setup so the npm CLI is available");
  await command(process.execPath, [
    npm,
    "ci",
    "--prefix",
    directory,
    "--cache",
    join(toolCache, "npm-cache"),
    "--no-audit",
    "--no-fund",
  ]);
  if (!works(executable, "-version")) throw new Error("Installed FFmpeg could not run");
  return executable;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log("FFmpeg:", await resolveFFmpeg());
  console.log("Whisper:", await resolveWhisper());
}
