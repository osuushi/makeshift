import assert from "node:assert/strict";

/** Longest suites first; each worker still executes its assigned suites serially. */
export function partition(suites, count) {
  assert.ok(Number.isInteger(count) && count > 0, "Choose a positive shard count");
  const shards = Array.from({ length: count }, () => ({ seconds: 0, suites: [] }));
  const ordered = [...suites].sort((a, b) => b.seconds - a.seconds || a.id.localeCompare(b.id));
  assert.equal(
    new Set(ordered.map((suite) => suite.id)).size,
    ordered.length,
    "Duplicate CI suite",
  );
  for (const suite of ordered) {
    assert.ok(Number.isFinite(suite.seconds) && suite.seconds > 0, `Invalid timing: ${suite.id}`);
    const target = shards.reduce((a, b) => (a.seconds <= b.seconds ? a : b));
    target.suites.push(suite);
    target.seconds += suite.seconds;
  }
  return shards;
}

export function shardIndex(value) {
  const match = /^(\d+)\/(\d+)$/.exec(value ?? "");
  assert.ok(match, "Choose shard index/count");
  const [index, count] = match.slice(1).map(Number);
  assert.ok(index > 0 && index <= count, "Shard index must be within count");
  return { index: index - 1, count };
}
