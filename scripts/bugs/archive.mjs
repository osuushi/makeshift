import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { unzipSync } from "fflate";

/** Never trust archive paths, links or commands supplied with a bug report. */
export async function extractReport(path, destination) {
  if ((await stat(path)).size > 160 * 1024 * 1024) throw new Error("Archive exceeds 160 MB");
  let total = 0;
  const files = unzipSync(await readFile(path), {
    filter: (entry) => {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/.test(entry.name))
        throw new Error("Unsafe archive path");
      total += entry.originalSize;
      if (total > 256 * 1024 * 1024) throw new Error("Expanded archive exceeds 256 MB");
      return true;
    },
  });
  const readJson = (name) => JSON.parse(new TextDecoder().decode(files[name]));
  const manifest = readJson("manifest.json");
  if (manifest.format !== "makeshift-bug" || manifest.version !== 1)
    throw new Error("Unsupported bug report");
  for (const media of manifest.media) {
    if (
      !/^(video-\d{4}|narration)\.webm$/.test(media.name) ||
      !files[media.name] ||
      !Number.isFinite(media.start) ||
      !Number.isFinite(media.end)
    )
      throw new Error("Invalid media manifest");
  }
  const events = readJson("events.json");
  // Require a new directory so symlinks or previous results cannot redirect writes.
  await mkdir(destination);
  for (const [name, bytes] of Object.entries(files))
    await writeFile(join(destination, name), bytes, { flag: "wx" });
  return { manifest, events };
}

export function importantMoments(manifest, events, at = []) {
  if (at.length) return at.map((seconds) => manifest.startedAt + seconds * 1000);
  const errors = events
    .filter((event) => /error|rejection/.test(event.kind))
    .map((event) => event.time);
  const actions = events
    .filter((event) => /pointerdown|keydown/.test(event.kind))
    .map((event) => event.time)
    .reverse();
  const chosen = [];
  for (const time of [...errors, manifest.startedAt, ...actions]) {
    if (chosen.every((other) => Math.abs(time - other) >= 3000)) chosen.push(time);
    if (chosen.length === 12) break;
  }
  return chosen.sort((a, b) => a - b);
}
