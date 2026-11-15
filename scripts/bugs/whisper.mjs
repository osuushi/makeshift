import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { copyCachedFile, legacyCache, publishFile, runtimeCache, toolCache } from "./cache.mjs";
import { command } from "./process.mjs";

const sourceCommit = "f92e1e4d1056700c39d4e86c1140f0a088fe1ab6";
const modelRevision = "5359861c739e955e79d9a303bcbc70fb988958b1";
const modelHash = "a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002";
const name = process.platform === "win32" ? "whisper-cli.exe" : "whisper-cli";
// Bump the recipe when changing build options; CPU-only binaries are relocatable.
const directory = join(runtimeCache, `whisper-${sourceCommit}-cpu-v1`);
export const cachedWhisper = join(directory, name);
const works = (path) =>
  spawnSync(path, ["--help"], { stdio: "ignore", timeout: 10000 }).status === 0;
const checksum = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function buildWhisper() {
  if (spawnSync("cmake", ["--version"], { stdio: "ignore" }).status !== 0)
    throw new Error("Local transcription setup needs CMake and a C++ compiler");
  console.log("Building pinned whisper.cpp in the shared tool cache (first use only)…");
  await mkdir(runtimeCache, { recursive: true });
  const source = await mkdtemp(join(runtimeCache, ".whisper-build-"));
  const build = join(source, "build");
  try {
    await command("git", ["init", source]);
    await command("git", [
      "-C",
      source,
      "fetch",
      "--depth=1",
      "https://github.com/ggml-org/whisper.cpp.git",
      sourceCommit,
    ]);
    await command("git", ["-C", source, "checkout", "--detach", sourceCommit]);
    await command("cmake", [
      "-S",
      source,
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
    const executable = join(
      build,
      "bin",
      ...(process.platform === "win32" ? ["Release"] : []),
      name,
    );
    if (!works(executable)) throw new Error("Built Whisper could not run");
    await copyCachedFile(join(source, "LICENSE"), join(directory, "LICENSE"));
    await copyCachedFile(executable, cachedWhisper);
  } finally {
    await rm(source, { recursive: true, force: true });
  }
}

async function whisperExecutable(install) {
  if (process.env.MAKESHIFT_WHISPER) {
    if (!works(process.env.MAKESHIFT_WHISPER)) throw new Error("MAKESHIFT_WHISPER could not run");
    return process.env.MAKESHIFT_WHISPER;
  }
  if (works("whisper-cli")) return "whisper-cli";
  if (works(cachedWhisper)) return cachedWhisper;
  if (!install) throw new Error("Whisper unavailable; run npm run bug:setup");
  const previous = join(legacyCache, `whisper-${sourceCommit}`);
  const executable = join(
    previous,
    "build/bin",
    ...(process.platform === "win32" ? ["Release"] : []),
    name,
  );
  if (works(executable)) {
    console.log("Reusing the existing Whisper build in the shared tool cache…");
    await copyCachedFile(join(previous, "LICENSE"), join(directory, "LICENSE"));
    await copyCachedFile(executable, cachedWhisper);
  } else await buildWhisper();
  if (!works(cachedWhisper)) throw new Error("Cached Whisper could not run");
  return cachedWhisper;
}

async function whisperModel(install) {
  const custom = process.env.MAKESHIFT_WHISPER_MODEL;
  if (custom) {
    if (!existsSync(custom)) throw new Error("MAKESHIFT_WHISPER_MODEL does not exist");
    return custom;
  }
  const model = join(toolCache, "models", `ggml-base.en-${modelHash}.bin`);
  if (!existsSync(model)) {
    if (!install) throw new Error("Whisper model unavailable; run npm run bug:setup");
    const previous = join(legacyCache, "ggml-base.en.bin");
    if (existsSync(previous) && checksum(await readFile(previous)) === modelHash) {
      console.log("Reusing the existing transcription model in the shared tool cache…");
      await copyCachedFile(previous, model);
    } else {
      console.log("Downloading the pinned base.en transcription model (~148 MB)…");
      const response = await fetch(
        `https://huggingface.co/ggerganov/whisper.cpp/resolve/${modelRevision}/ggml-base.en.bin`,
      );
      if (!response.ok) throw new Error(`Model download failed: ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (checksum(bytes) !== modelHash) throw new Error("Whisper model checksum mismatch");
      await publishFile(model, (path) => writeFile(path, bytes));
    }
  }
  if (checksum(await readFile(model)) !== modelHash)
    throw new Error("Cached Whisper model checksum mismatch; remove it and rerun bug:setup");
  return model;
}

export async function resolveWhisper(install = true) {
  const executable = await whisperExecutable(install);
  return { executable, model: await whisperModel(install) };
}
