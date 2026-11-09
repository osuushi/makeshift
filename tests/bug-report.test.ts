import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { unzipSync } from "fflate";
import type { BugReport } from "../src/bugs/protocol.js";
import { BugTimeline, recentSegments } from "../src/bugs/timeline.js";
import { saveBugArchive } from "../src/host/bug-archive.js";

test("prebuffer retains the boundary segment and prunes old inputs; recording pins inputs", () => {
  assert.deepEqual(
    recentSegments([{ end: 4000 }, { end: 9000 }, { end: 14000 }, { end: 19000 }], 20000),
    [{ end: 9000 }, { end: 14000 }, { end: 19000 }],
  );
  const timeline = new BugTimeline();
  timeline.add("keydown", { key: "a" }, 0);
  timeline.add("pointerdown", { x: 3 }, 21000);
  assert.equal(timeline.events.length, 1);
  timeline.recording = true;
  timeline.add("error", {}, 90000);
  assert.equal(timeline.events.length, 2);
  for (let i = 0; i < 21000; i++) timeline.add("keydown", {}, 90000 + i);
  assert.equal(timeline.events.length, 20000);
  assert.equal(timeline.dropped, 1002);
});

test("archive preserves playable segment bytes, fixtures, diagnostics and timing", async () => {
  const root = await mkdtemp(join(tmpdir(), "bug-archive-test-"));
  try {
    const snapshot = { document: { entities: [] }, preview: { entities: ["temporary"] } };
    const report: BugReport = {
      startedAt: 20000,
      endedAt: 25000,
      fixtures: { start: snapshot, end: snapshot },
      media: [
        {
          name: "video-0000.webm",
          start: 5000,
          end: 10000,
          bytes: new Uint8Array([1, 2, 3]).buffer,
        },
      ],
      events: [{ time: 22000, kind: "pointerdown", detail: { x: 12 } }],
      warnings: ["No microphone"],
    };
    const result = await saveBugArchive(report, { platform: "test" }, root);
    assert.match(result.name, /^bug-.*\.zip$/);
    const files = unzipSync(await readFile(result.path));
    const json = (name: string) => JSON.parse(new TextDecoder().decode(files[name]));
    assert.deepEqual(Array.from(files["video-0000.webm"]), [1, 2, 3]);
    assert.deepEqual(json("fixture-start.json").snapshot, snapshot);
    assert.deepEqual(json("preview-end.makeshift").document, snapshot.preview);
    assert.deepEqual(json("events.json"), report.events);
    assert.equal(json("manifest.json").media[0].start, 5000);
    assert.deepEqual(json("manifest.json").warnings, ["No microphone"]);
    report.media[0].name = "../escape.webm";
    await assert.rejects(saveBugArchive(report, {}, root), /Invalid report media/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
