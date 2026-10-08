import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cases } from "./cases.mjs";
import { Client, outcome } from "./client.mjs";

// Invoke under flock /tmp/makeshift-geometry-compute.lock. Alternatives are
// interleaved by block, with deterministic shuffled order to mitigate drift.
const output = process.argv[2];
if (!output)
  throw new Error("Usage: run.mjs OUTPUT.jsonl [FILTER] [BLOCKS] [label:path:threads,...]");
const filter = new RegExp(process.argv[3] ?? ".*");
const blocks = Number(process.argv[4] ?? 20);
const specs = (
  process.argv[5] ??
  "serial:.build/kernel/bin/makeshift-kernel:1,pool4:.build/kernel/bin/makeshift-kernel:4"
)
  .split(",")
  .map((value) => {
    const [label, executable, threads] = value.split(":");
    return { label, executable: resolve(executable), threads: Number(threads) };
  });
if (!Number.isInteger(blocks) || blocks < 1) throw new Error("Invalid block count");
let seed = 81623;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const clients = specs.map((spec) => new Client(spec.executable, spec.threads));
try {
  const selected = (await cases(clients[0])).filter(([name]) => filter.test(name));
  if (!selected.length) throw new Error("No selected cases");
  for (let block = -1; block < blocks; block++) {
    const order = specs.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (const [name, input] of selected)
      for (const index of order) {
        const cpuBefore = await readFile("/sys/fs/cgroup/cpu.stat", "utf8").catch(
          () => "unavailable",
        );
        const nativeMemoryBefore = await clients[index].memory();
        const measurement = await clients[index].request(input);
        const nativeMemoryAfter = await clients[index].memory();
        const cpuAfter = await readFile("/sys/fs/cgroup/cpu.stat", "utf8").catch(
          () => "unavailable",
        );
        const row = {
          timestamp: new Date().toISOString(),
          block,
          warmup: block < 0,
          referenceLabel: specs[0].label,
          name,
          ...specs[index],
          milliseconds: measurement.milliseconds,
          outcome: outcome(measurement.reply),
          phases: measurement.phases,
          cpuBefore,
          cpuAfter,
          nativeMemoryBefore,
          nativeMemoryAfter,
          memoryNote:
            "VmHWM and VmPeak are process lifetime high-water marks, not per-request peaks; snapshots are outside measured elapsed time.",
        };
        await appendFile(output, `${JSON.stringify(row)}\n`);
        console.log(
          `${block} ${specs[index].label} ${name} ${measurement.milliseconds.toFixed(1)}ms ${measurement.reply.error ?? "ok"}`,
        );
      }
  }
} finally {
  for (const client of clients) await client.close();
}
