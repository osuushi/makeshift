import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { strToU8, zipSync } from "fflate";
import { extractReport, importantMoments } from "../scripts/bugs/archive.mjs";

test("analysis refuses traversal and refuses reusing an extraction directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "bug-analysis-"));
  const path = join(root, "report.zip"),
    out = join(root, "out");
  const files = {
    "manifest.json": strToU8(JSON.stringify({ format: "makeshift-bug", version: 1, media: [] })),
    "events.json": strToU8("[]"),
  };
  try {
    await writeFile(path, zipSync({ ...files, "../escape": strToU8("bad") }));
    await assert.rejects(extractReport(path, out), /Unsafe archive path/);
    await writeFile(path, zipSync(files));
    assert.deepEqual((await extractReport(path, out)).events, []);
    await assert.rejects(extractReport(path, out), /EEXIST/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("analysis uses report-relative moments and prioritizes failures", () => {
  const manifest = { startedAt: 20000 };
  assert.deepEqual(importantMoments(manifest, [], [-5, 2]), [15000, 22000]);
  const events = [
    { time: 8000, kind: "error" },
    ...Array.from({ length: 20 }, (_, i) => ({ time: 30000 + 4000 * i, kind: "pointerdown" })),
  ];
  const moments = importantMoments(manifest, events);
  assert.ok(moments.includes(8000));
  assert.ok(moments.includes(20000));
  assert.equal(moments.length, 12);
});
