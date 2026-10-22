import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { browserClient, serve, webRoot } from "./browser.mjs";
import { measure, summary } from "./measure.mjs";
import { sweepCases } from "./sweep-cases.mjs";

const output = process.argv[2];
if (!output) throw new Error("Usage: candidate-interleaved.mjs OUTPUT.json");
const modes = ["off", "cpu", "gpu"];
const selected = sweepCases.filter(([name]) =>
  ["twist-90", "twist-450", "twist-cubic-draft"].includes(name),
);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const report = {
  capturedAt: new Date().toISOString(),
  commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  scriptHash: digest(await readFile(import.meta.filename)),
  assets: {},
  initialization: {},
  cases: [],
};
for (const file of await readdir(`${webRoot}/assets`))
  if (/^makeshift-(kernel|occt)-/.test(file))
    report.assets[file] = digest(await readFile(`${webRoot}/assets/${file}`));
process.env.MAKESHIFT_BENCHMARK_CANDIDATES = "off";
const server = await serve();
const browser = await chromium.launch({ headless: true, channel: "chromium" });
const clients = {};
try {
  report.browser = browser.version();
  for (const mode of modes) {
    process.env.MAKESHIFT_BENCHMARK_CANDIDATES = mode;
    clients[mode] = await browserClient(browser, server.url);
    report.initialization[mode] = clients[mode].initialization;
  }
  assert.equal(report.initialization.gpu.candidates.ready, true);
  for (const [name, input] of selected) {
    const scenario = { name, input },
      measured = { name, input, modes: {} };
    for (const mode of modes)
      measured.modes[mode] = { first: await measure(clients[mode], scenario), samples: [] };
    // Six rounds balance which backend runs first, with exactly one active calculation.
    for (let round = 0; round < 6; round++) {
      for (let i = 0; i < modes.length; i++) {
        const mode = modes[(round + i) % modes.length];
        measured.modes[mode].samples.push(await measure(clients[mode], scenario));
      }
    }
    const expected = measured.modes.off.first.outcome;
    assert.equal(expected.error, undefined);
    for (const mode of modes) {
      const values = measured.modes[mode];
      values.summary = summary(values.samples);
      for (const sample of [values.first, ...values.samples]) {
        assert.equal(
          sample.outcome.replyHash,
          expected.replyHash,
          `${name}: complete reply differs`,
        );
        if (mode === "gpu")
          for (const probe of sample.probes) {
            assert.ok(probe.candidates.completed > 0);
            assert.equal(probe.candidates.calls, probe.candidates.completed);
          }
      }
      console.log(`${name} ${mode}: ${values.summary.median.toFixed(1)} ms`);
    }
    report.cases.push(measured);
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  }
} finally {
  for (const client of Object.values(clients)) await client.close();
  await browser.close();
  await server.close();
}
