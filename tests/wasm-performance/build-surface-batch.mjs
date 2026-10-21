import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const cache = await readFile(".build/kernel/CMakeCache.txt", "utf8");
const config = /^OpenCASCADE_DIR:PATH=(.+)$/m.exec(cache)?.[1];
assert.ok(config, "Configure the native Release kernel first");
const sdk = resolve(config, "../../..");
await mkdir(".build/benchmarks", { recursive: true });
execFileSync(
  process.env.CXX ?? "c++",
  [
    "-O3",
    "-DNDEBUG",
    "-std=c++20",
    `-I${sdk}/include/opencascade`,
    "tests/wasm-performance/export-surface-batch.cpp",
    `-L${sdk}/lib`,
    `-Wl,-rpath,${sdk}/lib`,
    ...(process.platform === "linux" ? ["-Wl,--disable-new-dtags"] : []),
    ...["TKTopAlgo", "TKBRep", "TKGeomBase", "TKG3d", "TKG2d", "TKMath", "TKernel"].map(
      (name) => `-l${name}`,
    ),
    "-o",
    ".build/benchmarks/export-surface-batch",
  ],
  { stdio: "inherit" },
);
