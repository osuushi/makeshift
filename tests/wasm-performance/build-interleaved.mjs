import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";
import { Client } from "../geometry-performance/client.mjs";
import { browserClient, serve } from "./browser.mjs";
import { measure, summary } from "./measure.mjs";
import { sweepCases } from "./sweep-cases.mjs";

const [beforeKernel, beforeWeb, output] = process.argv.slice(2);
if (!beforeKernel || !beforeWeb || !output)
  throw new Error("Usage: build-interleaved.mjs BEFORE_KERNEL BEFORE_WEB OUTPUT.json");
const modes = ["before", "after"];
const selected = sweepCases.filter(([name]) =>
  ["twist-90", "twist-450", "twist-cubic-draft", "helix-2"].includes(name),
);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function assets(directory) {
  const result = {};
  for (const file of await readdir(`${directory}/assets`))
    if (/^makeshift-(kernel|occt)-/.test(file))
      result[file] = digest(await readFile(`${directory}/assets/${file}`));
  return result;
}
const executables = {
  before: resolve(beforeKernel),
  after: resolve(".build/kernel/bin/makeshift-kernel"),
};
const report = {
  capturedAt: new Date().toISOString(),
  scriptHash: digest(await readFile(import.meta.filename)),
  node: process.version,
  cpu: cpus()[0]?.model,
  executables: {},
  assets: { before: await assets(beforeWeb), after: await assets(".build/web") },
  runtimes: [],
};
for (const mode of modes)
  report.executables[mode] = {
    path: executables[mode],
    sha256: digest(await readFile(executables[mode])),
  };
const servers = {};
try {
  servers.before = await serve(beforeWeb);
  servers.after = await serve(".build/web");
  for (const name of ["native-1", "native-auto", "chromium", "webkit"]) await run(name);
} finally {
  for (const server of Object.values(servers)) await server.close();
}

async function run(name) {
  const runtime = { name, initialization: {}, cases: [] },
    clients = {};
  let browser;
  report.runtimes.push(runtime);
  try {
    if (!name.startsWith("native-")) {
      browser = await { chromium, webkit }[name].launch({ headless: true });
      runtime.version = browser.version();
    }
    for (const mode of modes) {
      clients[mode] = browser
        ? await browserClient(
            browser,
            servers[mode].url,
            180_000,
            mode === "before" ? beforeWeb : ".build/web",
          )
        : new Client(executables[mode], name === "native-1" ? 1 : cpus().length);
      runtime.initialization[mode] = clients[mode].initialization;
    }
    for (const [caseName, input] of selected) {
      const scenario = { name: caseName, input },
        measured = { name: caseName, input, modes: {} };
      for (const mode of modes)
        measured.modes[mode] = { first: await measure(clients[mode], scenario), samples: [] };
      // Six rounds balance order; there is exactly one active calculation.
      for (let round = 0; round < 6; round++)
        for (let i = 0; i < modes.length; i++) {
          const mode = modes[(round + i) % modes.length];
          measured.modes[mode].samples.push(await measure(clients[mode], scenario));
        }
      const expected = measured.modes.before.first.outcome;
      assert.equal(expected.error, undefined);
      for (const mode of modes) {
        const values = measured.modes[mode];
        values.summary = summary(values.samples);
        for (const sample of [values.first, ...values.samples])
          assert.deepEqual(sample.outcome, expected, `${name}/${caseName}: complete reply`);
        console.log(`${name} ${caseName} ${mode}: ${values.summary.median.toFixed(1)} ms`);
      }
      runtime.cases.push(measured);
      await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
    }
  } finally {
    for (const client of Object.values(clients)) await client.close();
    await browser?.close();
  }
}
