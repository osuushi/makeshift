import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { arch, cpus, platform, release } from "node:os";
import { dirname, resolve } from "node:path";
import { Client } from "../geometry-performance/client.mjs";
import { prepareBroadCases } from "./broad-cases.mjs";
import { serve, webRoot } from "./browser.mjs";
import { fixturePath, prepareCases } from "./cases.mjs";
import { runRuntime } from "./runtime.mjs";

const output = process.argv[2];
const repeats = Number(process.argv[3] ?? 5);
if (!output || !Number.isInteger(repeats) || repeats < 0)
  throw new Error("Usage: node tests/wasm-performance/run.mjs OUTPUT.json [SAMPLES=5]");
const executable = resolve(
  process.env.MAKESHIFT_BENCHMARK_NATIVE ?? ".build/kernel/bin/makeshift-kernel",
);
const filter = new RegExp(process.env.MAKESHIFT_BENCHMARK_CASE ?? ".*");
const engines = (
  process.env.MAKESHIFT_BENCHMARK_ENGINES ?? "native-1,native-auto,chromium,webkit"
).split(",");
if (engines.some((name) => !["native-1", "native-auto", "chromium", "webkit"].includes(name)))
  throw new Error("Unknown benchmark runtime");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const benchmarkSources = {};
for (const name of (await readdir(import.meta.dirname))
  .filter((name) => name.endsWith(".mjs"))
  .sort())
  benchmarkSources[name] = digest(await readFile(resolve(import.meta.dirname, name)));
const report = {
  capturedAt: new Date().toISOString(),
  source: {
    commit: git("rev-parse", "HEAD"),
    diffHash: digest(git("diff", "HEAD")),
    status: git("status", "--short"),
    benchmarkSources,
  },
  host: {
    platform: platform(),
    release: release(),
    arch: arch(),
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    node: process.version,
  },
  fixture: { path: fixturePath, sha256: digest(await readFile(fixturePath)) },
  native: { executable, sha256: digest(await readFile(executable)) },
  assets: {},
  runtimes: [],
};
await mkdir(dirname(resolve(output)), { recursive: true });
if (process.env.MAKESHIFT_BENCHMARK_LIBRARY_DIR) {
  const path = resolve(process.env.MAKESHIFT_BENCHMARK_LIBRARY_DIR, "libTKGeomBase.7.9.3.dylib");
  report.native.libraryOverride = { path, sha256: digest(await readFile(path)) };
}
const save = () => writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
const native = new Client(executable, 1);
let prepared;
try {
  prepared = await (process.env.MAKESHIFT_BENCHMARK_SUITE === "broad"
    ? prepareBroadCases
    : prepareCases)(native);
} finally {
  await native.close();
}
const selected = prepared.cases.filter((scenario) => filter.test(scenario.name));
if (!selected.length) throw new Error("No benchmark cases selected");
const browserRequested = engines.some((name) => name === "chromium" || name === "webkit");
if (browserRequested)
  for (const name of await readdir(`${webRoot}/assets`))
    if (/^makeshift-(occt|kernel)-/.test(name))
      report.assets[name] = digest(await readFile(`${webRoot}/assets/${name}`));
const server = browserRequested ? await serve() : null;
report.inputs = selected.map(({ name, input }) => ({
  name,
  sha256: digest(JSON.stringify(input)),
}));
report.suite = process.env.MAKESHIFT_BENCHMARK_SUITE ?? "ipad";
const references = new Map();
try {
  for (const name of engines)
    await runRuntime(name, {
      executable,
      server,
      report,
      selected,
      repeats,
      references,
      save,
      prepared,
    });
} finally {
  await server?.close();
  await save();
}
console.log(`Saved ${output}`);
if (
  report.runtimes.some((runtime) =>
    runtime.cases.some((c) => c.failure || c.comparisons.some((v) => !v.matches)),
  )
)
  process.exitCode = 1;
