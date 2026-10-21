import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "../geometry-performance/client.mjs";
import { prepareBroadCases } from "./broad-cases.mjs";

// Sampling perturbs execution. Use run.mjs, without a profiler, for timing comparisons.
const name = process.argv[2];
const directory = resolve(process.argv[3] ?? ".cache/wasm-performance/profiles");
const seconds = Number(process.argv[4] ?? 15);
if (!name || !Number.isFinite(seconds) || seconds <= 0 || process.platform !== "darwin")
  throw new Error("Usage on macOS: profile-native.mjs CASE [DIRECTORY] [SECONDS=15]");
await mkdir(directory, { recursive: true });
const kernel = new Client(resolve(".build/kernel/bin/makeshift-kernel"), 1);
let sampler;
try {
  const { cases } = await prepareBroadCases(kernel);
  const scenario = cases.find((candidate) => candidate.name === name);
  if (!scenario) throw new Error(`Unknown case ${name}`);
  await writeFile(`${directory}/${name}.input.json`, JSON.stringify(scenario.input));
  const output = `${directory}/${name}.sample.txt`;
  sampler = spawn("/usr/bin/sample", [
    String(kernel.child.pid),
    String(seconds),
    "1",
    "-file",
    output,
  ]);
  sampler.stderr.pipe(process.stderr);
  const complete = new Promise((accept, reject) => {
    sampler.once("error", reject);
    sampler.once("exit", (code) =>
      code === 0 ? accept() : reject(new Error(`sample exited ${code}`)),
    );
  });
  const start = performance.now();
  let count = 0;
  do {
    const result = await kernel.request(scenario.input);
    count++;
    if (count === 1 && result.reply.results?.[0])
      await writeFile(
        `${directory}/${name}.brep`,
        Buffer.from(result.reply.results[0].brep, "hex"),
      );
    await writeFile(`${directory}/${name}.phases.txt`, result.phases);
    if (result.reply.error) {
      console.log(`Kernel rejected ${name}: ${result.reply.error}`);
      break;
    }
  } while (performance.now() - start < seconds * 1000 + 500);
  await complete;
  console.log(`${name}: ${count} operations; profile ${output}`);
} finally {
  if (sampler && sampler.exitCode === null) sampler.kill();
  await kernel.close();
}
