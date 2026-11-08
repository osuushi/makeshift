import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ffmpegCommand } from "./process.mjs";

/** Quantize absolute boundaries, not individual durations, to avoid cumulative drift. */
export function playbackPlan(manifest) {
  const videos = manifest.media
    .filter((media) => media.name.startsWith("video-"))
    .sort((a, b) => a.start - b.start);
  if (!videos.length) throw new Error("Report contains no video");
  const origin = Math.min(videos[0].start, manifest.startedAt);
  const frame = (time) => Math.round(((time - origin) * 8) / 1000);
  const total = frame(manifest.endedAt);
  if (!Number.isFinite(total) || total <= 0 || total > 4800)
    throw new Error("Invalid playback duration (maximum ten minutes)");
  let cursor = 0;
  const parts = [];
  for (const video of videos) {
    const start = Math.max(cursor, frame(video.start)),
      end = Math.min(total, frame(video.end));
    if (end <= start) continue;
    if (start > cursor) parts.push({ frames: start - cursor });
    parts.push({
      name: video.name,
      frames: end - start,
      seek: Math.max(0, (origin + start * 125 - video.start) / 1000),
    });
    cursor = end;
  }
  if (cursor < total) parts.push({ frames: total - cursor });
  return { origin, duration: total / 8, parts };
}

export async function makePlayback(directory, manifest, executable) {
  const plan = playbackPlan(manifest),
    run = ffmpegCommand(executable);
  const work = join(directory, ".playback-work");
  await mkdir(work);
  try {
    const names = [];
    for (const [index, part] of plan.parts.entries()) {
      const name = `part-${String(index).padStart(4, "0")}.mp4`;
      names.push(name);
      const input = part.name
        ? ["-ss", String(part.seek), "-i", join(directory, part.name)]
        : ["-f", "lavfi", "-i", "color=c=black:s=1920x1200:r=8"];
      await run([
        ...input,
        "-an",
        "-vf",
        `setpts=PTS-STARTPTS,scale=1920:1200:force_original_aspect_ratio=decrease,pad=1920:1200:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=8,tpad=stop_mode=clone:stop_duration=${plan.duration}`,
        "-frames:v",
        String(part.frames),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        join(work, name),
      ]);
    }
    const list = join(work, "parts.txt");
    await writeFile(list, names.map((name) => `file '${name}'`).join("\n"));
    await muxPlayback(directory, manifest, plan, list, run);
    return {
      file: "playback.mp4",
      origin: plan.origin,
      reportStartSeconds: (manifest.startedAt - plan.origin) / 1000,
      duration: plan.duration,
      gapFrames: plan.parts
        .filter((part) => !part.name)
        .reduce((count, part) => count + part.frames, 0),
    };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

async function muxPlayback(directory, manifest, plan, list, run) {
  const narration = manifest.media.find((media) => media.name === "narration.webm");
  const audio = narration
    ? [
        "-i",
        join(directory, narration.name),
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-af",
        `asetpts=PTS-STARTPTS,adelay=${Math.max(0, Math.round(narration.start - plan.origin))}:all=1,apad`,
        "-c:a",
        "aac",
        "-b:a",
        "96k",
      ]
    : ["-an"];
  await run([
    "-f",
    "concat",
    "-safe",
    "1",
    "-i",
    list,
    ...audio,
    "-c:v",
    "copy",
    "-t",
    String(plan.duration),
    "-movflags",
    "+faststart",
    join(directory, "playback.mp4"),
  ]);
}
