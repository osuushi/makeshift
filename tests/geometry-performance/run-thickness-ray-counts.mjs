// Untimed diagnostic. Caller owns shared compute lock; native calls are serial.
// Usage: node run-thickness-ray-counts.mjs BASE TRACE OUTPUT.jsonl [FILTER]
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cases } from "./cases.mjs";
import { Client } from "./client.mjs";

const [baseline, traced, output, expression = "perforated|shell-bent|shell-notched"] =
  process.argv.slice(2);
assert.ok(baseline && traced && output, "Expected BASE TRACE OUTPUT [FILTER]");
const filter = new RegExp(expression);
const hash = async (path) =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
await writeFile(
  output,
  `${JSON.stringify({
    type: "configuration",
    baseline: resolve(baseline),
    traced: resolve(traced),
    baselineSha256: await hash(baseline),
    wrapperSha256: await hash(traced),
    threads: 1,
    diagnosticOnly: true,
    note: "Trace counters invalidate timings and memory. Query repeats count attempts, not certified reusable successful results.",
  })}\n`,
  { flag: "wx" },
);
const reference = new Client(resolve(baseline), 1);
function compare(a, b, path = "reply") {
  if (typeof a === "number" && typeof b === "number") {
    assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)), path);
  } else if (Array.isArray(a) && Array.isArray(b)) {
    assert.equal(a.length, b.length, path);
    a.forEach((item, i) => {
      compare(item, b[i], `${path}[${i}]`);
    });
  } else if (a && b && typeof a === "object" && typeof b === "object") {
    assert.deepEqual(Object.keys(a), Object.keys(b), path);
    for (const key of Object.keys(a)) if (key !== "brep") compare(a[key], b[key], `${path}.${key}`);
  } else assert.deepEqual(a, b, path);
}
async function finish(client) {
  // EOF lets native destructors flush counters. Client.close normally uses SIGTERM.
  const closed = new Promise((resolve) => client.child.once("close", resolve));
  client.child.stdin.end();
  await closed;
  await client.close();
}
try {
  const selected = (await cases(reference)).filter(([name]) => filter.test(name));
  assert.ok(selected.length, "No selected cases");
  for (const [name, input] of selected) {
    const expected = await reference.request(input);
    const diagnostic = new Client(resolve(traced), 1);
    let actual;
    try {
      actual = await diagnostic.request(input);
    } finally {
      await finish(diagnostic);
    }
    const stderr = diagnostic.stderr;
    const counters = stderr
      .split("\n")
      .filter((line) => line.startsWith("{"))
      .map((line) => JSON.parse(line))
      .filter((row) => row.type?.startsWith("thickness_ray_"));
    assert.ok(
      counters.some((row) => row.type === "thickness_ray_totals"),
      "Missing trace report",
    );
    let metadataMatch = "matched";
    try {
      compare(expected.reply, actual.reply);
    } catch (error) {
      metadataMatch = error.message;
    }
    await appendFile(
      output,
      `${JSON.stringify({
        type: "case",
        name,
        input,
        baselineReply: expected.reply,
        tracedReply: actual.reply,
        metadataMatch,
        stderr,
        counters,
      })}\n`,
    );
    console.error(`${name}: ${metadataMatch}; ${JSON.stringify(counters)}`);
  }
} finally {
  await reference.close();
}
