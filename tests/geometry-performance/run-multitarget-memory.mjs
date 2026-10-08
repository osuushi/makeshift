// Caller must hold /tmp/makeshift-geometry-compute.lock. All native work is serial.
// Usage: node run-multitarget-memory.mjs OUTPUT.jsonl [BLOCKS=10]
//   [baseline:/absolute/executable,candidate:/absolute/executable] [FILTER=.*]
// Each measured request gets a fresh process with NO fixture-construction requests.
import assert from "node:assert/strict";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { square } from "./cases.mjs";
import { Client, operand, outcome } from "./client.mjs";

const output = process.argv[2];
const blocks = Number(process.argv[3] ?? 10);
const specification =
  process.argv[4] ??
  `baseline:${resolve(".build/kernel/bin/makeshift-kernel")},candidate:${resolve(".cache/geometry-performance/bspline-cache/bin/makeshift-kernel-fork")}`;
const filter = new RegExp(process.argv[5] ?? ".*");
assert.ok(
  output && Number.isInteger(blocks) && blocks > 0,
  "Expected OUTPUT [BLOCKS] [label:path,...] [FILTER]",
);
const specs = specification.split(",").map((entry) => {
  const separator = entry.indexOf(":");
  const label = entry.slice(0, separator),
    executable = entry.slice(separator + 1);
  assert.ok(
    separator > 0 && /^[\w-]+$/.test(label) && isAbsolute(executable),
    "Invalid label:absoluteExecutable",
  );
  return { label, executable };
});
assert.equal(new Set(specs.map(({ label }) => label)).size, specs.length, "Duplicate label");
let seed = 20261008;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
function shuffle(values) {
  const items = [...values];
  for (let i = items.length - 1; i > 0; --i) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
const extrude = (profile) => ({
  kind: "extrude",
  normal: [0, 0, 1],
  profiles: [profile],
  distance: 20,
  mode: "new",
  bodies: [],
});
function profile(name, offset = 0) {
  if (name === "perforated") {
    const value = square(offset, 0, 60);
    for (let x = 10; x <= 50; x += 10) {
      for (let y = 10; y <= 50; y += 10) {
        value.holes.push([
          {
            kind: "circle",
            center: [x + offset, y, 0],
            radius: 2,
            normal: [0, 0, 1],
            axis: [1, 0, 0],
          },
        ]);
      }
    }
    return value;
  }
  return {
    outer: [
      { kind: "line", a: [offset, 0, 0], b: [40 + offset, 0, 0] },
      { kind: "line", a: [40 + offset, 0, 0], b: [40 + offset, 40, 0] },
      {
        kind: "bezier",
        a: [40 + offset, 40, 0],
        c1: [30 + offset, 43, 0],
        c2: [10 + offset, 43, 0],
        b: [offset, 40, 0],
      },
      { kind: "line", a: [offset, 40, 0], b: [offset, 0, 0] },
    ],
    holes: [],
  };
}
async function fixtures(executable) {
  const preparationClient = new Client(executable, 1);
  const result = [];
  try {
    for (const name of ["cubic", "perforated"]) {
      const accepted = (await preparationClient.request(extrude(profile(name)))).reply;
      const disjoint = (await preparationClient.request(extrude(profile(name, 120)))).reply;
      assert.ok(
        !accepted.error && !disjoint.error,
        `Fixture preparation failed: ${accepted.error ?? disjoint.error}`,
      );
      assert.equal(accepted.results.length, 1, "Expected one accepted stock solid");
      assert.equal(disjoint.results.length, 1, "Expected one disjoint control solid");
      result.push({
        name,
        stock: accepted.results[0],
        disjoint: disjoint.results[0],
        tool: name === "cubic" ? square(15, 30, 15) : square(25, 25, 20),
      });
    }
  } finally {
    await preparationClient.close();
  }
  return result;
}
function configurations(fixed) {
  const result = [];
  for (const fixture of fixed) {
    for (const count of [1, 4, 16]) {
      for (const control of ["overlap-only", "extra-disjoint"]) {
        // Separate IDs and decoding create independent bodies with equal material.
        const bodies = Array.from({ length: count }, (_, i) =>
          operand(fixture.stock, `stock-${i}`),
        );
        if (control === "extra-disjoint") bodies.push(operand(fixture.disjoint, "disjoint"));
        for (const operation of ["implicit-subtract", "explicit-auto"]) {
          const name = `${fixture.name}-${operation}-n${count}-${control}`;
          if (!filter.test(name)) continue;
          result.push({
            name,
            fixture: fixture.name,
            operation,
            targetCount: count,
            bodyCount: bodies.length,
            control,
            input: {
              ...extrude(fixture.tool),
              distance: 25,
              mode: operation === "implicit-subtract" ? "subtract" : "auto",
              bodies,
              ...(operation === "explicit-auto" ? { targets: bodies.map(({ id }) => id) } : {}),
            },
          });
        }
      }
    }
  }
  return result;
}
const cpu = () => readFile("/sys/fs/cgroup/cpu.stat", "utf8").catch(() => "unavailable");
async function measure(configuration, spec, block, representatives) {
  const client = new Client(spec.executable, 1);
  try {
    const nativeMemoryBefore = await client.memory();
    const cpuBefore = await cpu();
    const measurement = await client.request(configuration.input);
    const nativeMemoryAfter = await client.memory();
    const cpuAfter = await cpu();
    const representative =
      block === 0 ? resolve(representatives, `${spec.label}-${configuration.name}.json`) : null;
    if (representative)
      await writeFile(representative, `${JSON.stringify(measurement.reply)}\n`, { flag: "wx" });
    const { input: _input, ...descriptor } = configuration;
    const row = {
      timestamp: new Date().toISOString(),
      block,
      label: spec.label,
      executable: spec.executable,
      threads: 1,
      referenceLabel: specs[0].label,
      ...descriptor,
      milliseconds: measurement.milliseconds,
      phases: measurement.phases,
      outcome: outcome(measurement.reply),
      nativeMemoryBefore,
      nativeMemoryAfter,
      memoryNote:
        "Fresh prep-free process per sample; VmHWM/VmPeak include startup and this request, not an isolated per-request peak. Snapshots are outside elapsed time.",
      cpuBefore,
      cpuAfter,
      representative,
    };
    await appendFile(output, `${JSON.stringify(row)}\n`);
    console.error(
      `${block + 1}/${blocks} ${spec.label} ${configuration.name}: ${measurement.milliseconds.toFixed(1)} ms ${measurement.reply.error ?? "ok"}`,
    );
  } finally {
    await client.close();
  }
}
await writeFile(output, "", { flag: "wx" });
const representatives = `${output}.representatives`;
await mkdir(representatives);
const fixed = await fixtures(specs[0].executable);
const selected = configurations(fixed);
assert.ok(selected.length, "No selected cases");
// Metadata kept separately so existing summarize.mjs can consume every JSONL row.
await writeFile(
  `${output}.metadata.json`,
  `${JSON.stringify(
    {
      blocks,
      specs,
      seed,
      filter: filter.source,
      constructorExecutable: specs[0].executable,
      fixtureFaces: fixed.map(({ name, stock }) => ({ name, faces: stock.faces.length })),
      targetCountMeaning:
        "Positive-overlap independent bodies; extra-disjoint adds one body and one explicit target.",
      timingNote:
        "No warmup: each measurement uses a fresh process. First request elapsed can include remaining process startup.",
    },
    null,
    2,
  )}\n`,
  { flag: "wx" },
);
for (let block = 0; block < blocks; ++block) {
  for (const configuration of shuffle(selected)) {
    for (const spec of shuffle(specs)) await measure(configuration, spec, block, representatives);
  }
}
