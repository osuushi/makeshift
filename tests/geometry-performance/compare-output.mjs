import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cases } from "./cases.mjs";
import { Client } from "./client.mjs";

// Full output regression check, including thickness/chain references and display
// triangles. Intended for representation-preserving candidates; report baseline
// nondeterminism separately rather than treating reordered output as equivalent.
const [baseline, candidate, filter = "^(extrude|boolean)", output] = process.argv.slice(2);
if (!baseline || !candidate)
  throw new Error("Usage: compare-output.mjs BASELINE CANDIDATE [FILTER] [OUTPUT.json]");
const clients = [baseline, candidate].map((path) => new Client(resolve(path), 4));
const records = [];
function compare(a, b, path = "reply") {
  if (typeof a === "number" && typeof b === "number")
    assert.ok(
      Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)),
      `${path}: ${a} != ${b}`,
    );
  else if (Array.isArray(a) && Array.isArray(b)) {
    assert.equal(a.length, b.length, `${path}.length`);
    a.forEach((value, i) => {
      compare(value, b[i], `${path}[${i}]`);
    });
  } else if (a && b && typeof a === "object" && typeof b === "object") {
    assert.deepEqual(Object.keys(a), Object.keys(b), path);
    for (const key of Object.keys(a)) if (key !== "brep") compare(a[key], b[key], `${path}.${key}`);
  } else assert.deepEqual(a, b, path);
}
try {
  const selected = (await cases(clients[0])).filter(([name]) => new RegExp(filter).test(name));
  for (const [name, input] of selected) {
    const a = (await clients[0].request(input)).reply;
    const repeat = (await clients[0].request(input)).reply;
    const b = (await clients[1].request(input)).reply;
    let baselineRepeat = "matched",
      candidateMatch = "matched";
    try {
      compare(a, repeat);
    } catch (error) {
      baselineRepeat = error.message;
    }
    try {
      compare(a, b);
    } catch (error) {
      candidateMatch = error.message;
    }
    records.push({
      name,
      baselineRepeat,
      candidateMatch,
      baselineError: a.error,
      candidateError: b.error,
    });
    console.log(JSON.stringify(records.at(-1)));
  }
  if (output) await writeFile(output, `${JSON.stringify(records, null, 2)}\n`);
  if (
    records.some(
      (record) => record.candidateMatch !== "matched" && record.baselineRepeat === "matched",
    )
  )
    process.exitCode = 1;
} finally {
  for (const client of clients) await client.close();
}
