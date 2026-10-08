// Native invocations are strictly serial. Caller holds the shared compute lock.
// Usage: node run-volume-comparison.mjs OUTPUT BLOCKS [x|y|z|adaptive]
//   baseline:/absolute/binary,fork:/absolute/binary /absolute/fixture.brep [...]
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { loadavg } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);

const args = process.argv.slice(2);
const output = args.shift();
const blocks = Number(args.shift());
const filter = ["x", "y", "z", "adaptive"].includes(args[0]) ? args.shift() : "";
const specification = args.shift();
assert.ok(
  output && Number.isInteger(blocks) && blocks > 0 && specification && args.length,
  "Expected OUTPUT BLOCKS [FILTER] label:absoluteExecutable,... fixture.brep [...]",
);
const configurations = specification.split(",").map((entry) => {
  const separator = entry.indexOf(":");
  assert.ok(separator > 0, `Invalid executable specification: ${entry}`);
  const label = entry.slice(0, separator),
    executable = entry.slice(separator + 1);
  assert.ok(isAbsolute(executable), `Executable must be absolute: ${executable}`);
  return { label, executable };
});
assert.equal(
  new Set(configurations.map(({ label }) => label)).size,
  configurations.length,
  "Executable labels must be unique",
);
const fixtures = args.map((fixture) => resolve(fixture));
assert.equal(new Set(fixtures).size, fixtures.length, "Duplicate fixtures");
const bits = (value) => {
  if (!Number.isFinite(value)) return null;
  const buffer = Buffer.alloc(8);
  buffer.writeDoubleLE(value);
  return buffer.toString("hex");
};
const snapshot = () => {
  let cpuStat = null;
  try {
    cpuStat = readFileSync("/sys/fs/cgroup/cpu.stat", "utf8");
  } catch {}
  return { utc: new Date().toISOString(), loadavg: loadavg(), cpuStat };
};
let seed = 20261008;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; --i) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
writeFileSync(
  output,
  `${JSON.stringify({
    type: "run",
    blocks,
    filter,
    configurations,
    fixtures,
    seed,
    node: process.version,
    started: snapshot(),
  })}\n`,
  { flag: "wx" },
);
for (let block = 0; block < blocks; ++block) {
  for (const fixture of shuffle(fixtures)) {
    for (const { label, executable } of shuffle(configurations)) {
      const before = snapshot();
      const start = process.hrtime.bigint();
      const invocation = [fixture, "1", ...(filter ? [filter] : [])];
      const child = await execute(executable, invocation, {
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
      });
      const wallMs = Number(process.hrtime.bigint() - start) / 1e6;
      const after = snapshot();
      const lines = child.stdout.trim().split("\n");
      assert.ok(lines[0], `${label}/${fixture}: empty stdout`);
      const rows = lines.map((line) => JSON.parse(line));
      assert.equal(
        rows.filter((row) => row.type === "input").length,
        1,
        "Expected input descriptor",
      );
      const expectedAxes = filter ? [filter] : ["x", "y", "z", "adaptive"];
      for (const axis of expectedAxes) {
        for (const nativeBlock of [-1, 0]) {
          const matches = rows.filter(
            (row) => row.type === "volume" && row.axis === axis && row.block === nativeBlock,
          );
          assert.equal(matches.length, 1, `Expected ${axis} block ${nativeBlock}`);
          assert.ok(Number.isFinite(matches[0].ms) && matches[0].ms >= 0, "Invalid timing");
        }
      }
      for (const row of rows) {
        assert.ok(["input", "face", "volume"].includes(row.type), "Unexpected native record");
        appendFileSync(
          output,
          `${JSON.stringify({
            ...row,
            nativeBlock: row.block ?? null,
            block,
            label,
            fixture,
            executable,
            warmup: row.block === -1,
            ...(row.type === "volume"
              ? { massBits: bits(row.mass), errorBits: bits(row.error) }
              : {}),
          })}\n`,
        );
      }
      appendFileSync(
        output,
        `${JSON.stringify({
          type: "invocation",
          block,
          label,
          fixture,
          executable,
          invocation,
          wallMs,
          before,
          after,
          stderr: child.stderr,
        })}\n`,
      );
      console.error(`${block + 1}/${blocks} ${label} ${fixture}: ${wallMs.toFixed(1)} ms`);
    }
  }
}
