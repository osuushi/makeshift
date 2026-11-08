import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Zippable, zip } from "fflate";
import type { BugReport } from "../bugs/protocol.js";

export async function saveBugArchive(report: BugReport, runtime: unknown, root = tmpdir()) {
  if (
    !report ||
    !Number.isFinite(report.startedAt) ||
    !Number.isFinite(report.endedAt) ||
    !Array.isArray(report.media) ||
    report.media.length > 128 ||
    !Array.isArray(report.events) ||
    report.events.length > 20000
  )
    throw new Error("Invalid bug report");
  const files: Zippable = {};
  const json = (name: string, value: unknown) => {
    files[name] = new TextEncoder().encode(JSON.stringify(value, null, 2));
  };
  let bytes = 0;
  for (const media of report.media) {
    if (
      !/^(video-\d{4}|narration)\.webm$/.test(media.name) ||
      files[media.name] ||
      !(media.bytes instanceof ArrayBuffer)
    )
      throw new Error("Invalid report media");
    bytes += media.bytes.byteLength;
    if (bytes > 128 * 1024 * 1024) throw new Error("Report media exceeds 128 MB");
    files[media.name] = [new Uint8Array(media.bytes), { level: 0 }];
  }
  for (const stage of ["start", "end"] as const) {
    const snapshot = report.fixtures?.[stage];
    if (!snapshot || typeof snapshot !== "object" || !("document" in snapshot))
      throw new Error("Missing fixture");
    json(`fixture-${stage}.json`, {
      format: "freac-fixture",
      version: 1,
      capturedAt: new Date(stage === "start" ? report.startedAt : report.endedAt).toISOString(),
      snapshot,
    });
    json(`accepted-${stage}.makeshift`, {
      format: "makeshift",
      version: 1,
      document: snapshot.document,
    });
    if ("preview" in snapshot && snapshot.preview)
      json(`preview-${stage}.makeshift`, {
        format: "makeshift",
        version: 1,
        document: snapshot.preview,
      });
  }
  json("manifest.json", {
    format: "makeshift-bug",
    version: 1,
    startedAt: report.startedAt,
    endedAt: report.endedAt,
    runtime,
    warnings: report.warnings,
    media: report.media.map(({ bytes: _bytes, ...entry }) => entry),
    timing:
      "Unix epoch milliseconds; video before startedAt is silent prebuffer; narration has its own start offset.",
  });
  json("events.json", report.events);
  files["README.txt"] = new TextEncoder().encode(
    "Makeshift bug report\nRead manifest.json and its warnings first. Video segments are independently playable in timestamp order. Narration is separate. fixture-start.json and fixture-end.json preserve accepted and temporary geometry without finishing the tool. Input logs and visible window contents may contain private data. Nothing was uploaded automatically. See docs/bug-reports.md and scripts/bugs/analyze.mjs in the repository.\n",
  );
  const archive = await new Promise<Uint8Array>((resolve, reject) =>
    zip(files, { level: 1 }, (error, data) => (error ? reject(error) : resolve(data))),
  );
  const directory = join(root, "makeshift-bugs");
  await mkdir(directory, { recursive: true });
  const name = `bug-${new Date(report.startedAt).toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}.zip`;
  const path = join(directory, name);
  await writeFile(path, archive, { flag: "wx" });
  return { name, path };
}
