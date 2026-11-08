import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { extractReport, importantMoments } from "./archive.mjs";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: "string" },
    frames: { type: "boolean" },
    audio: { type: "boolean" },
    at: { type: "string", multiple: true },
    whisper: { type: "string" },
    model: { type: "string" },
  },
});
if (positionals.length !== 1 || !values.out)
  throw new Error(
    "Usage: node scripts/bugs/analyze.mjs bug-TIMESTAMP.zip --out NEW_DIRECTORY [--frames] [--at SECONDS] [--audio] [--whisper /path/to/whisper-cli --model /path/to/model.bin]",
  );
if (!!values.whisper !== !!values.model) throw new Error("Use --whisper and --model together");
const at = (values.at ?? []).map(Number);
if (at.some((time) => !Number.isFinite(time)))
  throw new Error("--at must be seconds relative to report start (negative for prebuffer)");
const directory = resolve(values.out);
const { manifest, events } = await extractReport(resolve(positionals[0]), directory);
const command = (program, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(program, args, { stdio: "inherit", shell: false });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${program} exited ${code}`)),
    );
  });
const ffmpeg = (args) =>
  command("ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-n", ...args]);
const index = {
  startedAt: manifest.startedAt,
  warnings: manifest.warnings,
  moments: [],
  narration: null,
};
if (values.frames) {
  await mkdir(join(directory, "frames"));
  const moments = importantMoments(manifest, events, at);
  for (const [number, time] of moments.entries()) {
    const nearby = events.filter((event) => Math.abs(event.time - time) <= 2000);
    const moment = { seconds: (time - manifest.startedAt) / 1000, events: nearby, images: [] };
    for (const video of manifest.media.filter(
      (media) =>
        media.name.startsWith("video-") && media.start < time + 2000 && media.end > time - 2000,
    )) {
      const start = Math.max(video.start, time - 2000),
        end = Math.min(video.end, time + 2000);
      const prefix = `moment-${String(number).padStart(2, "0")}-${video.name.replace(".webm", "")}`;
      await ffmpeg([
        "-ss",
        String((start - video.start) / 1000),
        "-i",
        join(directory, video.name),
        "-t",
        String((end - start) / 1000),
        "-vf",
        "fps=1",
        join(directory, "frames", `${prefix}-%02d.jpg`),
      ]);
      moment.images.push({
        pattern: `frames/${prefix}-*.jpg`,
        startSeconds: (start - manifest.startedAt) / 1000,
      });
    }
    index.moments.push(moment);
  }
}
const narration = manifest.media.find((media) => media.name === "narration.webm");
if ((values.audio || values.whisper) && narration) {
  const wav = join(directory, "narration.wav");
  await ffmpeg([
    "-i",
    join(directory, narration.name),
    "-vn",
    "-ar",
    "16000",
    "-ac",
    "1",
    "-c:a",
    "pcm_s16le",
    wav,
  ]);
  index.narration = {
    file: "narration.wav",
    offsetSeconds: (narration.start - manifest.startedAt) / 1000,
  };
  if (values.whisper)
    await command(resolve(values.whisper), [
      "-m",
      resolve(values.model),
      "-f",
      wav,
      "-oj",
      "-otxt",
      "-of",
      join(directory, "transcript"),
    ]);
}
await writeFile(join(directory, "analysis.json"), JSON.stringify(index, null, 2));
console.log(
  `Extracted report to ${directory}. Read manifest.json, analysis.json and fixture-start.json first.`,
);
if ((values.audio || values.whisper) && !narration)
  console.log("No narration track; inspect manifest warnings.");
