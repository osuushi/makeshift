import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { command } from "./process.mjs";

const root = resolve(import.meta.dirname, "../..");
export const toolCache = join(root, ".cache/bug-tools");
const sourceCommit = "f92e1e4d1056700c39d4e86c1140f0a088fe1ab6";
const modelRevision = "5359861c739e955e79d9a303bcbc70fb988958b1";
const modelHash = "a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002";
const works = (path, flag) =>
  spawnSync(path, [flag], { stdio: "ignore", timeout: 10000 }).status === 0;

export async function resolveFFmpeg(install = true) {
  if (process.env.MAKESHIFT_FFMPEG && works(process.env.MAKESHIFT_FFMPEG, "-version"))
    return process.env.MAKESHIFT_FFMPEG;
  if (works("ffmpeg", "-version")) return "ffmpeg";
  const directory = join(toolCache, "ffmpeg");
  const executable = join(
    directory,
    "node_modules/ffmpeg-static",
    process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg",
  );
  if (works(executable, "-version")) return executable;
  if (!install)
    throw new Error("FFmpeg unavailable; run npm run bug:setup or set MAKESHIFT_FFMPEG");
  console.log("Installing pinned FFmpeg in .cache/bug-tools (no system changes)…");
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

export async function resolveWhisper(install = true) {
  const directory = join(toolCache, `whisper-${sourceCommit}`);
  const build = join(directory, "build");
  const name = process.platform === "win32" ? "whisper-cli.exe" : "whisper-cli";
  let executable = process.env.MAKESHIFT_WHISPER;
  if (!executable && works("whisper-cli", "--help")) executable = "whisper-cli";
  if (!executable)
    executable = join(build, "bin", ...(process.platform === "win32" ? ["Release"] : []), name);
  if (!works(executable, "--help")) {
    if (!install) throw new Error("Whisper unavailable; run npm run bug:setup");
    if (!works("cmake", "--version"))
      throw new Error(
        "Local transcription setup needs CMake and a C++ compiler (the app's existing build prerequisites)",
      );
    console.log("Building pinned whisper.cpp locally (first use only)…");
    await mkdir(directory, { recursive: true });
    if (!existsSync(join(directory, "CMakeLists.txt"))) {
      await command("git", ["init", directory]);
      await command("git", [
        "-C",
        directory,
        "fetch",
        "--depth=1",
        "https://github.com/ggml-org/whisper.cpp.git",
        sourceCommit,
      ]);
      await command("git", ["-C", directory, "checkout", "--detach", sourceCommit]);
    }
    await command("cmake", [
      "-S",
      directory,
      "-B",
      build,
      "-DCMAKE_BUILD_TYPE=Release",
      "-DBUILD_SHARED_LIBS=OFF",
      "-DWHISPER_BUILD_TESTS=OFF",
      "-DGGML_METAL=OFF",
      "-DGGML_NATIVE=OFF",
    ]);
    await command("cmake", [
      "--build",
      build,
      "--config",
      "Release",
      "--target",
      "whisper-cli",
      "-j",
      String(Math.min(4, availableParallelism())),
    ]);
    if (!works(executable, "--help")) throw new Error("Built Whisper could not run");
  }
  const model = process.env.MAKESHIFT_WHISPER_MODEL || join(toolCache, "ggml-base.en.bin");
  if (process.env.MAKESHIFT_WHISPER_MODEL) {
    if (!existsSync(model)) throw new Error("MAKESHIFT_WHISPER_MODEL does not exist");
  } else if (!existsSync(model)) {
    if (!install) throw new Error("Whisper model unavailable; run npm run bug:setup");
    console.log("Downloading the pinned base.en transcription model (~148 MB)…");
    await mkdir(toolCache, { recursive: true });
    const response = await fetch(
      `https://huggingface.co/ggerganov/whisper.cpp/resolve/${modelRevision}/ggml-base.en.bin`,
    );
    if (!response.ok) throw new Error(`Model download failed: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (createHash("sha256").update(bytes).digest("hex") !== modelHash)
      throw new Error("Whisper model checksum mismatch");
    await writeFile(`${model}.tmp`, bytes);
    await rename(`${model}.tmp`, model);
  }
  if (
    !process.env.MAKESHIFT_WHISPER_MODEL &&
    createHash("sha256")
      .update(await readFile(model))
      .digest("hex") !== modelHash
  )
    throw new Error("Cached Whisper model checksum mismatch; remove it and rerun bug:setup");
  return { executable, model };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log("FFmpeg:", await resolveFFmpeg());
  console.log("Whisper:", await resolveWhisper());
}
