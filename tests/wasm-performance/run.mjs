import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { arch, cpus, platform, release } from "node:os";
import { dirname, resolve } from "node:path";
import { chromium, webkit } from "playwright";
import { Client } from "../geometry-performance/client.mjs";
import { browserClient, serve } from "./browser.mjs";
import { fixturePath, prepareCases } from "./cases.mjs";
import { measureDrag } from "./drag.mjs";
import { compare, measure, summary } from "./measure.mjs";

const output = process.argv[2];
const repeats = Number(process.argv[3] ?? 5);
if (!output || !Number.isInteger(repeats) || repeats < 1)
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
const report = {
  capturedAt: new Date().toISOString(),
  source: {
    commit: git("rev-parse", "HEAD"),
    diffHash: digest(git("diff", "HEAD")),
    status: git("status", "--short"),
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
const save = () => writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
const native = new Client(executable, 1);
let prepared;
try {
  prepared = await prepareCases(native);
} finally {
  await native.close();
}
const selected = prepared.cases.filter((scenario) => filter.test(scenario.name));
if (!selected.length) throw new Error("No benchmark cases selected");
const browserRequested = engines.some((name) => name === "chromium" || name === "webkit");
if (browserRequested)
  for (const name of await readdir(".build/web/assets"))
    if (/^makeshift-(occt|kernel)-/.test(name))
      report.assets[name] = digest(await readFile(`.build/web/assets/${name}`));
const server = browserRequested ? await serve() : null;
const references = new Map();
try {
  for (const name of engines) await runRuntime(name);
} finally {
  await server?.close();
  await save();
}
console.log(`Saved ${output}`);
if (
  report.runtimes.some((runtime) =>
    runtime.cases.some((c) => c.comparisons.some((v) => !v.matches)),
  )
)
  process.exitCode = 1;

async function runRuntime(name) {
  let browser, client;
  const runtime = { name, cases: [] };
  report.runtimes.push(runtime);
  try {
    if (name.startsWith("native-")) {
      runtime.threads = name === "native-auto" ? cpus().length : 1;
      client = new Client(executable, runtime.threads);
    } else {
      if (!{ chromium, webkit }[name]) throw new Error(`Unknown runtime ${name}`);
      browser = await { chromium, webkit }[name].launch({ headless: true });
      runtime.version = browser.version();
      client = await browserClient(browser, server.url);
      runtime.initialization = client.initialization;
    }
    for (const scenario of selected) {
      const cold = await measure(client, scenario);
      const samples = [];
      for (let i = 0; i < repeats; i++) samples.push(await measure(client, scenario));
      const comparisons = [cold, ...samples].map(({ outcome }) => {
        try {
          compare(outcome, scenario.expected ?? references.get(scenario.name) ?? cold.outcome);
          return { matches: true };
        } catch (error) {
          return { matches: false, reason: error.message };
        }
      });
      references.set(scenario.name, references.get(scenario.name) ?? cold.outcome);
      const measured = {
        name: scenario.name,
        first: cold,
        samples,
        summary: summary(samples),
        comparisons,
      };
      runtime.cases.push(measured);
      await save();
      console.log(
        `${name} ${scenario.name}: ${measured.summary.median.toFixed(1)} ms; ${measured.summary.probes} probe(s)${measured.summary.size === undefined ? "" : `; radius ${measured.summary.size}`} ${comparisons.every((c) => c.matches) ? "geometry agrees" : "GEOMETRY DIFFERS"}`,
      );
    }
    await client.close();
    client = null;
    if (browser && process.env.MAKESHIFT_BENCHMARK_DRAG !== "0") {
      runtime.drags = [];
      for (const warm of [false, true]) {
        const drag = await measureDrag(browser, server.url, prepared.fixture, warm);
        runtime.drags.push(drag);
        console.log(
          `${name} ${warm ? "warmed" : "first"} drag: ${drag.visibleUpdatesDuringDrag} visible updates, ${drag.workerStarts} worker starts, ${drag.finalSettleMilliseconds.toFixed(1)} ms final settle`,
        );
        await save();
      }
    }
  } finally {
    await client?.close();
    await browser?.close();
  }
}
